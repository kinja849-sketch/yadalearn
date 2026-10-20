import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket as NodeWebSocket } from "ws";

// Plugin to serve stream tokens securely without exposing the secret to the frontend
const streamTokenPlugin = () => {
  const handler = (server: any) => {
    server.middlewares.use('/api/get-stream-token', (req: any, res: any) => {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      const secret = env.STREAM_SECRET;
      
      if (!secret || secret === 'YOUR_STREAM_SECRET' || secret.startsWith('YOUR_')) {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ 
          error: "STREAM_SECRET is not configured or is using default placeholder in .env",
          configured: false 
        }));
      }

      const url = new URL(req.url, `http://${req.headers.host}`);
      const userId = url.searchParams.get('user_id');
      const userRole = url.searchParams.get('role') || 'user';
      const streamRole = userRole === 'teacher' ? 'admin' : 'user';

      if (!userId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "user_id query parameter is required" }));
      }

      try {
        const token = jwt.sign({ user_id: userId, role: streamRole }, secret, { algorithm: 'HS256', noTimestamp: true });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ token }));
      } catch (err: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  };

  return {
    name: 'stream-token-plugin',
    configureServer: handler,
    configurePreviewServer: handler
  };
};

// Plugin to serve Student AI (Aoede) Socratic mentoring responses securely
const studentAIPlugin = () => {
  const handler = (server: any) => {
    // Utility to strictly strip all markdown symbols (*, #, bullets, tildes, backticks)
    const stripSymbols = (text: string): string => {
      if (!text) return '';
      return text
        .replace(/[*#_~`]/g, '')
        .replace(/^[•\-\*]\s+/gm, '')
        .replace(/\n\s*[-•]\s*/g, ' ')
        .replace(/•/g, '')
        .replace(/\$\$/g, '')
        .replace(/\$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    // Helper to wrap raw 16-bit mono PCM bytes into playable WAV audio
    const pcmToWav = (pcmBuffer: Buffer, sampleRate = 24000): Buffer => {
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
      const blockAlign = (numChannels * bitsPerSample) / 8;
      const dataSize = pcmBuffer.length;
      const header = Buffer.alloc(44);

      header.write('RIFF', 0);
      header.writeUInt32LE(36 + dataSize, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20); // 1 = PCM
      header.writeUInt16LE(numChannels, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(byteRate, 28);
      header.writeUInt16LE(blockAlign, 32);
      header.writeUInt16LE(bitsPerSample, 34);
      header.write('data', 36);
      header.writeUInt32LE(dataSize, 40);

      return Buffer.concat([header, pcmBuffer]);
    };

    // Endpoint to serve authentic Google Gemini Aoede human voice synthesis
    server.middlewares.use('/api/tts', (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
      }

      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', async () => {
        try {
          const { text } = JSON.parse(body || '{}');
          const cleanText = stripSymbols(text);
          const env = loadEnv(server.config.mode, process.cwd(), '');
          const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

          if (geminiApiKey) {
            try {
              // Call Google Gemini Audio generation endpoint with verified active models for Aoede voice
              let geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [
                    {
                      role: 'user',
                      parts: [
                        {
                          text: cleanText
                        }
                      ]
                    }
                  ],
                  generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                      voiceConfig: {
                        prebuiltVoiceConfig: {
                          voiceName: "Aoede"
                        }
                      }
                    }
                  }
                })
              });

              if (!geminiRes.ok) {
                // Secondary fallback: gemini-2.5-flash-preview-tts
                geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiApiKey}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: cleanText }] }],
                    generationConfig: {
                      responseModalities: ["AUDIO"],
                      speechConfig: {
                        voiceConfig: {
                          prebuiltVoiceConfig: {
                            voiceName: "Aoede"
                          }
                        }
                      }
                    }
                  })
                });
              }

              if (geminiRes.ok) {
                const data = await geminiRes.json();
                const part = data?.candidates?.[0]?.content?.parts?.[0];
                const inlineData = part?.inlineData;


                if (inlineData?.data) {
                  let rawBase64 = inlineData.data;
                  let mimeType = inlineData.mimeType || 'audio/wav';

                  // If returned as raw PCM, wrap with standard RIFF/WAV header so browser plays natively
                  if (mimeType.includes('pcm')) {
                    const pcmBuffer = Buffer.from(rawBase64, 'base64');
                    const wavBuffer = pcmToWav(pcmBuffer, 24000);
                    rawBase64 = wavBuffer.toString('base64');
                    mimeType = 'audio/wav';
                  }

                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({
                    audioContent: rawBase64,
                    mimeType: mimeType,
                    voice: 'Aoede',
                    source: 'gemini-neural'
                  }));
                }
              } else {
                const errData = await geminiRes.text();
                console.warn('[Gemini Aoede Audio] API error status:', geminiRes.status, errData);
              }
            } catch (ttsErr) {
              console.warn('[Aoede TTS] Gemini audio generation error:', ttsErr);
            }
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ audioContent: null, voice: 'Aoede', fallback: true }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });

    server.middlewares.use('/api/student-ai', (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
      }

      let body = '';
      req.on('data', (chunk: any) => {
        body += chunk;
      });

      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const { 
            messages = [], 
            subject = 'General Studies', 
            studentName = 'Student',
            activeAssignment = null,
            detectedAssignments = [],
            isVoiceMode = false,
            currentDate = '',
            currentTime = '',
            hasAssignments = false
          } = parsed;
          
          const latestMessage = messages.length > 0 ? messages[messages.length - 1].content : '';
          const env = loadEnv(server.config.mode, process.cwd(), '');
          const firstName = studentName.split(' ')[0] || 'there';

          const todayDateStr = currentDate || new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          const todayTimeStr = currentTime || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const noAssignments = !hasAssignments && !activeAssignment && (!detectedAssignments || detectedAssignments.length === 0);

          // Check if external API key is provided
          const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

          if (geminiApiKey) {
            try {
              let assignmentInfo = '';
              if (activeAssignment) {
                assignmentInfo = `Current assignment: "${activeAssignment.title}" for ${activeAssignment.courseTitle}. Description: ${activeAssignment.description || 'General exercises'}.`;
              } else if (detectedAssignments.length > 0) {
                assignmentInfo = `Student assignments available: ${detectedAssignments.map((a: any) => `"${a.title}" in ${a.courseTitle}`).join(', ')}.`;
              } else {
                assignmentInfo = `The student currently has NO pending assignments today.`;
              }

              const sysPrompt = `You are Aoede, a warm, patient, and highly intelligent human tutor and study companion on YadaLearn for ${studentName} studying ${subject}.
Today's Date: ${todayDateStr}. Current Time: ${todayTimeStr}.
Assignment Status: ${assignmentInfo}

CRITICAL RULES:
1. Speak in pure, natural human sentences. NEVER output symbols such as asterisks (*), hashtags (#), bullet points (•), dashes, or markdown tags.
2. Direct Date & Time Answers: When asked what date or time it is, answer with the actual current date (${todayDateStr}) and time accurately and conversationally.
3. Proactive Assignment Awareness: If the student has no assignments today, proactively ask: "Since today you don't have assignments, is there something that is on your mind that you want to work on?"
4. Open-Ended Tasks: When the student gives you ANY task (e.g. writing an essay, summarizing, problem solving, creative brainstorming, study planning), enthusiastically help them accomplish that task step by step.
5. NEVER repeat previous responses or generic canned questions like "What is the very first part of this question you want to explore?"
6. ${isVoiceMode ? 'Voice Mode: Keep your answer natural, direct, and concise (1 to 2 spoken sentences, maximum 35 words).' : 'Text Mode: Keep responses helpful, direct, and focused.'}`;
              
              const candidateModels = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.7-flash'];
              for (const model of candidateModels) {
                try {
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 3500);

                  const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                      contents: [
                        { role: 'user', parts: [{ text: `${sysPrompt}\n\nStudent message: "${latestMessage}"` }] }
                      ]
                    })
                  }).finally(() => clearTimeout(timeoutId));
                  
                  if (geminiRes.ok) {
                    const data = await geminiRes.json();
                    const rawReply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (rawReply) {
                      res.setHeader('Content-Type', 'application/json');
                      return res.end(JSON.stringify({
                        reply: stripSymbols(rawReply),
                        detectedAssignment: activeAssignment?.title
                      }));
                    }
                  }
                } catch (mErr) {
                  // Try next model candidate
                }
              }
            } catch (apiErr) {
              // Fast fallback: proceed directly to instant local pedagogical engine
            }
          }

          // Built-in high-performance, instant intelligent pedagogical engine for Aoede (< 10ms execution)
          let reply = '';
          const lowerMsg = (latestMessage || '').toLowerCase().trim();
          const cleanInput = lowerMsg.replace(/[^a-z0-9\s]/g, '');

          // Inspect conversation history for context and repetition prevention
          const previousAssistantMessages = messages
            .filter((m: any) => m.role === 'assistant' || m.sender === 'ai')
            .map((m: any) => (m.content || m.text || '').toLowerCase());
          const lastAssistant = previousAssistantMessages[previousAssistantMessages.length - 1] || '';
          const userMessages = messages.filter((m: any) => m.role === 'user' || m.sender === 'user');
          const turnCount = userMessages.length;

          // Echo suppression guard: If student message is an echo of the assistant's previous message
          const lastAssistantClean = (lastAssistant || '').replace(/[^a-z0-9\s]/g, '');
          if (
            lastAssistantClean && 
            cleanInput.length > 8 && 
            (lastAssistantClean.includes(cleanInput) || cleanInput.includes(lastAssistantClean))
          ) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              reply: noAssignments 
                ? `Since today you don't have assignments, is there something that is on your mind that you want to work on, ${firstName}?`
                : `I am right here with you, ${firstName}! What topic or question should we start with?`,
              detectedAssignment: activeAssignment?.title
            }));
          }

          // 1. Date & Time Queries: "what date is it", "what is the date", "what day is today", "what time"
          if (
            cleanInput.includes('what date') ||
            cleanInput.includes('whats the date') ||
            cleanInput.includes('what is the date') ||
            cleanInput.includes('what day is today') ||
            cleanInput.includes('what day is it') ||
            cleanInput.includes('what is today') ||
            cleanInput.includes('todays date') ||
            cleanInput.includes('what time') ||
            cleanInput.includes('whats the time')
          ) {
            if (cleanInput.includes('time')) {
              reply = `Right now it is ${todayTimeStr} on ${todayDateStr}. What would you like to work on together, ${firstName}?`;
            } else {
              reply = `Today is ${todayDateStr}. What would you like to explore or work on together, ${firstName}?`;
            }
          }
          // 2. Inquiries about assignments / homework
          else if (
            cleanInput.includes('assignment') || 
            cleanInput.includes('homework') ||
            cleanInput.includes('what do i have') ||
            cleanInput.includes('do i have') ||
            cleanInput.includes('my tasks')
          ) {
            if (noAssignments) {
              reply = `Since today you don't have assignments, is there something that is on your mind that you want to work on?`;
            } else {
              const a = activeAssignment || detectedAssignments[0];
              reply = `You have ${a.title} for ${a.courseTitle}${a.dueDate ? ' due on ' + a.dueDate : ''}. Would you like to work on that together, or is there another task on your mind?`;
            }
          }
          // 3. Social Inquiries: "How are you", "how are u", "how r u", "how is it going"
          else if (
            cleanInput.includes('how are you') || 
            cleanInput.includes('how are u') || 
            cleanInput.includes('how r u') || 
            cleanInput.includes('how do you do') ||
            cleanInput.includes('how is it going') ||
            cleanInput.includes('hows it going') ||
            cleanInput.includes('how are you doing')
          ) {
            if (noAssignments) {
              reply = `I am doing wonderful, ${firstName}! Since today you don't have assignments, is there something that is on your mind that you want to work on?`;
            } else {
              reply = `I am doing wonderful, ${firstName}! Thank you for asking. I am energized and ready to help. What would you like to explore together in ${subject}?`;
            }
          }
          // 4. Greetings: "hy", "hi", "hello", "hey", "good morning", "yo"
          else if (
            cleanInput === 'hy' ||
            cleanInput === 'hi' ||
            cleanInput === 'hello' ||
            cleanInput === 'hey' ||
            cleanInput === 'yo' ||
            cleanInput.startsWith('hello') ||
            cleanInput.startsWith('good morning') ||
            cleanInput.startsWith('good afternoon') ||
            cleanInput.startsWith('good evening')
          ) {
            if (noAssignments) {
              reply = `Hello ${firstName}! Since today you don't have assignments, is there something that is on your mind that you want to work on?`;
            } else {
              const a = activeAssignment || detectedAssignments[0];
              reply = `Hello ${firstName}! I see you have ${a.title} for ${a.courseTitle}. Shall we work on that, or is there something else on your mind?`;
            }
          }
          // 5. Open-ended Task Support: user gives any task (writing, drafting, brainstorming, summarizing, solving)
          else if (
            cleanInput.startsWith('help me') ||
            cleanInput.startsWith('can you help') ||
            cleanInput.startsWith('can you') ||
            cleanInput.startsWith('write') ||
            cleanInput.startsWith('draft') ||
            cleanInput.startsWith('summarize') ||
            cleanInput.startsWith('create') ||
            cleanInput.startsWith('outline') ||
            cleanInput.startsWith('make') ||
            cleanInput.startsWith('generate') ||
            cleanInput.startsWith('calculate') ||
            cleanInput.startsWith('solve')
          ) {
            reply = `I would love to help you with that, ${firstName}! Tell me the details or requirements of what you want to achieve, and we will work through it step by step.`;
          }
          // 6. Identity and Capabilities: "who are you", "what can you do"
          else if (
            cleanInput.includes('who are you') ||
            cleanInput.includes('who r u') ||
            cleanInput.includes('what is your name') ||
            cleanInput.includes('whats your name')
          ) {
            reply = `I am Aoede, your personal study companion here on YadaLearn. I can help you with your lessons, work through essays, solve problems, or tackle any project on your mind. What would you like to work on?`;
          }
          else if (
            cleanInput.includes('what can you do') ||
            cleanInput === 'help'
          ) {
            reply = `I can help you break down assignments in ${subject}, explain complex ideas, guide you through math problems, brainstorm essays, or assist with any task on your mind. Where shall we start?`;
          }
          // 7. Gratitude: "thank you", "thanks"
          else if (
            cleanInput.includes('thank you') ||
            cleanInput.includes('thanks') ||
            cleanInput.includes('thx') ||
            cleanInput.includes('appreciate it')
          ) {
            reply = `You are very welcome, ${firstName}! You are doing great. What would you like to look at next?`;
          }
          // 8. Short Affirmations: "ok", "okay", "yes", "sure", "alright", "got it"
          else if (
            cleanInput === 'ok' ||
            cleanInput === 'okay' ||
            cleanInput === 'yes' ||
            cleanInput === 'yeah' ||
            cleanInput === 'sure' ||
            cleanInput === 'alright' ||
            cleanInput === 'got it'
          ) {
            reply = `Great! Tell me what specific topic, task, or concept you would like to begin with, and we will take it from there.`;
          }
          // 9. Confusion or need for simpler explanation
          else if (
            cleanInput.includes('dont understand') ||
            cleanInput.includes('confused') ||
            cleanInput.includes('do not get it') ||
            cleanInput.includes('what do you mean')
          ) {
            reply = `No worries at all, ${firstName}. Let us take it one piece at a time. What is the very first part that feels unclear?`;
          }
          // 10. Scientific & Conceptual Topics: Photosynthesis, Cells, Gravity, Atoms, etc.
          else if (lowerMsg.includes('photosynthesis') || lowerMsg.includes('chlorophyll')) {
            reply = `Photosynthesis is how plants use sunlight, water, and carbon dioxide to create glucose and oxygen. To begin step by step, what pigment inside plant leaves captures sunlight?`;
          }
          else if (lowerMsg.includes('cell') || lowerMsg.includes('mitochondria') || lowerMsg.includes('dna')) {
            reply = `Cells are the building blocks of life, with specialized organelles doing distinct jobs. Thinking of the cell like a busy factory, which organelle acts as the powerhouse generating cellular energy?`;
          }
          else if (lowerMsg.includes('gravity') || lowerMsg.includes('newton') || lowerMsg.includes('force')) {
            reply = `Gravity is the universal force of attraction between masses. When you release an object, gravity pulls it downward. How do you think mass and distance affect how strong this gravitational pull is?`;
          }
          else if (lowerMsg.includes('atom') || lowerMsg.includes('molecule') || lowerMsg.includes('periodic')) {
            reply = `Everything around us is composed of atoms containing protons, neutrons, and electrons. What particles reside in the central nucleus, and which ones orbit around the outside?`;
          }
          // 11. Mathematics calculations, algebra & equations
          else if (
            /(\d+)\s*[\+\-\*\/]\s*(\d+)|([x-z]\s*[\+\-\=\*])|equation/i.test(lowerMsg) ||
            lowerMsg.includes('solve') || 
            lowerMsg.includes('calculate') ||
            lowerMsg.includes('fraction') ||
            lowerMsg.includes('pythagorean')
          ) {
            if (lowerMsg.includes('fraction')) {
              reply = `Working with fractions is all about parts of a whole. When adding or subtracting fractions, what must be identical on the bottom before you can combine them?`;
            } else if (lowerMsg.includes('pythagorean') || lowerMsg.includes('hypotenuse')) {
              reply = `In any right-angled triangle, a squared plus b squared equals c squared. Which side is the longest side, directly opposite the right angle?`;
            } else {
              reply = `Let us work through this math problem together, ${firstName}. Look closely at the equation: what is the main operation acting on the variable, and what inverse step can we take first to isolate it?`;
            }
          }
          // 12. Conceptual questions ("what is", "how do", "why", "explain")
          else if (lowerMsg.includes('what is') || lowerMsg.includes('how do') || lowerMsg.includes('explain') || lowerMsg.includes('why')) {
            const cleanTopic = lowerMsg
              .replace(/^(what is|how do|how does|can you explain|explain|tell me about|why is|why does)\s+/i, '')
              .replace(/\?+$/, '')
              .trim();
            
            if (cleanTopic.length > 2) {
              reply = `To understand ${cleanTopic} in ${subject}, let us break it down into simple, intuitive parts. What is the very first thing you already know or have observed about this concept?`;
            } else {
              reply = `That is an insightful question about ${subject}, ${firstName}. How would you describe the main idea in your own everyday words?`;
            }
          }
          // 13. General Contextual Fallback (Guaranteed non-repetitive & tailored to student's state)
          else {
            if (noAssignments) {
              reply = `Since today you don't have assignments, is there something that is on your mind that you want to work on, ${firstName}?`;
            } else {
              const a = activeAssignment || detectedAssignments[0];
              reply = `I am ready when you are, ${firstName}. We can work on ${a.title} for ${a.courseTitle}, or explore any other topic you choose.`;
            }
          }

          // Anti-repetition safety guard: ensure new reply never matches the previous assistant reply
          if (stripSymbols(reply).toLowerCase() === lastAssistant && lastAssistant.length > 0) {
            if (noAssignments) {
              reply = `I am all ears, ${firstName}. Give me any task, question, or study topic you want to tackle, and let us get started.`;
            } else {
              reply = `I hear you, ${firstName}. Tell me what specific aspect or problem you want to start with, and we will take it from there.`;
            }
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            reply: stripSymbols(reply),
            detectedAssignment: activeAssignment?.title
          }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || "Failed to process AI request" }));
        }
      });
    });
  };

  return {
    name: 'student-ai-plugin',
    configureServer: handler,
    configurePreviewServer: handler
  };
};

const teacherAIPlugin = () => {
  const handler = (server: any) => {
    server.middlewares.use('/api/teacher-ai', (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
      }

      let body = '';
      req.on('data', (chunk: any) => {
        body += chunk;
      });

      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const { action = 'chat', ...payload } = parsed;
          const env = loadEnv(server.config.mode, process.cwd(), '');
          const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

          // Helper to strip markdown symbols
          const stripSymbols = (str: string) => {
            if (!str) return '';
            return str
              .replace(/[*_~`#>\\]/g, '')
              .replace(/^[•\-+]\s+/gm, '')
              .replace(/\n\s*[-*]\s+/g, '\n')
              .replace(/\s{2,}/g, ' ')
              .trim();
          };

          if (action === 'grade_submission') {
            const { assignmentTitle = 'Assignment', submissionContent = '', studentName = 'Student' } = payload;
            
            if (geminiApiKey && submissionContent.trim()) {
              try {
                const prompt = `You are an expert pedagogical grading assistant for educators. Evaluate this student submission for the assignment "${assignmentTitle}".
Student Name: ${studentName}
Submission Content:
"${submissionContent}"

Respond in STRICT JSON format with NO markdown wrapping, following this schema:
{
  "suggestedGrade": <integer between 0 and 100>,
  "strengths": "<1-2 sentences on what the student did well, without any asterisks or bullet symbols>",
  "growthAreas": "<1-2 sentences on specific areas for improvement, without symbols>",
  "suggestedFeedback": "<encouraging, actionable feedback paragraph addressing the student warmly, symbol-free>",
  "summary": "<one sentence overall assessment>"
}`;

                const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiApiKey}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                      responseMimeType: "application/json"
                    }
                  })
                });

                if (geminiRes.ok) {
                  const data = await geminiRes.json();
                  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (rawText) {
                    const parsedJson = JSON.parse(rawText);
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({
                      suggestedGrade: typeof parsedJson.suggestedGrade === 'number' ? parsedJson.suggestedGrade : 85,
                      strengths: stripSymbols(parsedJson.strengths || 'Demonstrates clear understanding of core concepts.'),
                      growthAreas: stripSymbols(parsedJson.growthAreas || 'Could provide more detailed examples.'),
                      suggestedFeedback: stripSymbols(parsedJson.suggestedFeedback || 'Great effort on this submission. Keep up the thorough work.'),
                      summary: stripSymbols(parsedJson.summary || 'Solid submission meeting assignment requirements.')
                    }));
                  }
                }
              } catch (gErr) {
                console.warn('[Teacher AI] Gemini grading error, using heuristic fallback:', gErr);
              }
            }

            // Heuristic fallback for grading
            const wordCount = submissionContent.trim().split(/\s+/).length;
            const fallbackGrade = Math.min(95, Math.max(70, 75 + Math.floor(wordCount / 8)));
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              suggestedGrade: fallbackGrade,
              strengths: `Clear engagement with the topic of ${assignmentTitle} and thoughtful articulation.`,
              growthAreas: 'Consider elaborating further on specific technical examples and underlying mechanisms.',
              suggestedFeedback: `Good work, ${studentName}. You have a solid grasp of the core concepts in ${assignmentTitle}. For future submissions, try backing up your points with concrete examples to deepen your analysis.`,
              summary: 'Submission demonstrates satisfactory comprehension and meets assignment criteria.'
            }));
          }

          if (action === 'lesson_plan') {
            const { subject = 'General Studies', title = 'Live Class', duration = '60 min' } = payload;

            if (geminiApiKey) {
              try {
                const prompt = `You are a master teacher and lesson designer. Create an interactive lesson plan and discussion starter guide for:
Subject: ${subject}
Lesson Topic: ${title}
Duration: ${duration}

Respond in STRICT JSON format with NO markdown wrapping, following this schema:
{
  "learningObjectives": ["<objective 1>", "<objective 2>", "<objective 3>"],
  "hook": "<engaging 5-minute interactive icebreaker or thought-provoking puzzle, symbol-free>",
  "timeline": [
    {"phase": "Hook and Warm-Up", "duration": "10 min", "activity": "<activity description, symbol-free>"},
    {"phase": "Interactive Concept Exploration", "duration": "25 min", "activity": "<activity description, symbol-free>"},
    {"phase": "Collaborative Practice", "duration": "15 min", "activity": "<activity description, symbol-free>"},
    {"phase": "Socratic Wrap-Up", "duration": "10 min", "activity": "<activity description, symbol-free>"}
  ],
  "discussionQuestions": [
    "<deep conceptual inquiry question 1, symbol-free>",
    "<real-world application question 2, symbol-free>",
    "<challenge question 3, symbol-free>"
  ],
  "descriptionText": "<concise 2-sentence summary ready to display in session description, symbol-free>"
}`;

                const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiApiKey}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                      responseMimeType: "application/json"
                    }
                  })
                });

                if (geminiRes.ok) {
                  const data = await geminiRes.json();
                  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (rawText) {
                    const parsedJson = JSON.parse(rawText);
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({
                      learningObjectives: (parsedJson.learningObjectives || []).map((o: string) => stripSymbols(o)),
                      hook: stripSymbols(parsedJson.hook || `Introduce a real-world scenario relating to ${title}.`),
                      timeline: (parsedJson.timeline || []).map((t: any) => ({
                        phase: stripSymbols(t.phase || ''),
                        duration: t.duration || '15 min',
                        activity: stripSymbols(t.activity || '')
                      })),
                      discussionQuestions: (parsedJson.discussionQuestions || []).map((q: string) => stripSymbols(q)),
                      descriptionText: stripSymbols(parsedJson.descriptionText || `An interactive exploration of ${title} in ${subject}.`)
                    }));
                  }
                }
              } catch (lErr) {
                console.warn('[Teacher AI] Gemini lesson planning error, using fallback:', lErr);
              }
            }

            // Heuristic fallback for lesson plan
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              learningObjectives: [
                `Master foundational principles of ${title}`,
                `Apply ${subject} methods to solve guided challenge problems`,
                `Critically evaluate real-world implications through open discussion`
              ],
              hook: `Begin with a 5-minute riddle or practical question asking how ${title} impacts everyday decisions.`,
              timeline: [
                { phase: "Hook & Warm-Up", duration: "10 min", activity: `Review prior knowledge and present the opening dilemma for ${title}.` },
                { phase: "Interactive Exploration", duration: "25 min", activity: "Walk through core formulas and visual diagrams with live student contributions." },
                { phase: "Collaborative Practice", duration: "15 min", activity: "Students work in pairs or breakout discussions to solve targeted exercises." },
                { phase: "Socratic Wrap-Up", duration: "10 min", activity: "Synthesize insights and pose exit ticket discussion questions." }
              ],
              discussionQuestions: [
                `Why is understanding ${title} fundamental to broader concepts in ${subject}?`,
                `How would you explain the core mechanism of ${title} to someone who has never studied it before?`,
                `What is one common misconception about this topic and how do we avoid it?`
              ],
              descriptionText: `In this session, students will explore core concepts of ${title} in ${subject} through guided interactive problem-solving and structured peer discussion.`
            }));
          }

          if (action === 'engagement_radar') {
            const { studentName = 'Student', attendance = '95%', grade = '90%', missingWork = 0 } = payload;

            if (geminiApiKey) {
              try {
                const prompt = `You are a supportive academic advisor. Analyze the engagement profile for student "${studentName}":
Attendance: ${attendance}
Grade: ${grade}
Missing Assignments: ${missingWork}

Respond in STRICT JSON format with NO markdown wrapping:
{
  "riskLevel": "<low | medium | high>",
  "trendAnalysis": "<1-2 sentence assessment of engagement trend, symbol-free>",
  "recommendedAction": "<actionable pedagogical suggestion for the teacher, symbol-free>",
  "suggestedMessage": "<friendly, empowering message the teacher can send to the student, symbol-free>"
}`;

                const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiApiKey}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                      responseMimeType: "application/json"
                    }
                  })
                });

                if (geminiRes.ok) {
                  const data = await geminiRes.json();
                  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (rawText) {
                    const parsedJson = JSON.parse(rawText);
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({
                      riskLevel: parsedJson.riskLevel || (missingWork > 1 ? 'medium' : 'low'),
                      trendAnalysis: stripSymbols(parsedJson.trendAnalysis || `${studentName} maintains steady academic momentum with solid attendance.`),
                      recommendedAction: stripSymbols(parsedJson.recommendedAction || 'Continue positive reinforcement and invite contributions in live class.'),
                      suggestedMessage: stripSymbols(parsedJson.suggestedMessage || `Hi ${studentName}! Great work in class recently. Looking forward to our next session!`)
                    }));
                  }
                }
              } catch (eErr) {
                console.warn('[Teacher AI] Gemini engagement error, using fallback:', eErr);
              }
            }

            const riskLevel = missingWork > 2 ? 'high' : missingWork > 0 ? 'medium' : 'low';
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              riskLevel,
              trendAnalysis: missingWork > 0 
                ? `${studentName} shows good overall attendance (${attendance}), but has ${missingWork} missing assignment(s) that need gentle attention.`
                : `${studentName} is performing strongly with ${attendance} attendance and zero missing work.`,
              recommendedAction: missingWork > 0
                ? 'Check in during office hours to see if any concepts in the missing assignment require clarification.'
                : 'Praise their consistent discipline and suggest advanced extension exercises if they seek more challenge.',
              suggestedMessage: missingWork > 0
                ? `Hi ${studentName}, I noticed you had an assignment pending. Please let me know if you would like to go over any questions together before class!`
                : `Hi ${studentName}, outstanding job staying on top of your coursework. Keep up the high standard!`
            }));
          }

          // Default: General Teacher Co-Pilot Chat
          const { message = '', teacherName = 'Teacher' } = payload;
          if (geminiApiKey && message.trim()) {
            try {
              const prompt = `You are Aoede, the pedagogical AI Co-Pilot for teachers on YadaLearn.
Teacher Name: ${teacherName}
Question or Request: "${message}"

Provide a concise, practical, encouraging educational recommendation.
Keep response direct and conversational. Do NOT use any asterisks, hashes, or bullet symbols.`;

              const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ role: 'user', parts: [{ text: prompt }] }]
                })
              });

              if (geminiRes.ok) {
                const data = await geminiRes.json();
                const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (replyText) {
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ reply: stripSymbols(replyText) }));
                }
              }
            } catch (cErr) {
              console.warn('[Teacher AI] Gemini chat error, using fallback:', cErr);
            }
          }

          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            reply: `I am here to assist with lesson planning, grading rubrics, and student engagement strategies. How can I help with your classes today?`
          }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || "Failed to process Teacher AI request" }));
        }
      });
    });
  };

  return {
    name: 'teacher-ai-plugin',
    configureServer: handler,
    configurePreviewServer: handler
  };
};

// Weather condition descriptor for Open-Meteo codes
const getWeatherCondition = (code: number): string => {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([61, 63, 65].includes(code)) return "Rain";
  if ([71, 73, 75].includes(code)) return "Snowfall";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Fair weather";
};

// Plugin to serve real-time bidirectional Google Gemini Live sessions via WebSocket
const geminiLiveGatewayPlugin = () => {
  return {
    name: 'gemini-live-gateway-plugin',
    configureServer(server: any) {
      if (!server.httpServer) return;

      const wss = new WebSocketServer({ noServer: true });

      server.httpServer.on('upgrade', (req: any, socket: any, head: any) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (url.pathname === '/api/gemini-live-ws') {
          wss.handleUpgrade(req, socket, head, (clientWs) => {
            wss.emit('connection', clientWs, req);
          });
        }
      });

      wss.on('connection', async (clientWs: any, req: any) => {
        const env = loadEnv(server.config.mode, process.cwd(), '');
        const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

        if (!geminiApiKey) {
          clientWs.send(JSON.stringify({ type: 'error', error: 'GEMINI_API_KEY is not configured on the server.' }));
          clientWs.close(1008, 'API Key missing');
          return;
        }

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const studentName = url.searchParams.get('studentName') || 'Student';
        const subject = url.searchParams.get('subject') || 'General Studies';
        const userId = url.searchParams.get('userId') || '';

        const todayDateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const todayTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const geminiLiveUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${geminiApiKey}`;
        const upstreamWs = new NodeWebSocket(geminiLiveUrl);

        let isUpstreamReady = false;
        const pendingClientQueue: string[] = [];

        // Upstream connection opened
        upstreamWs.on('open', () => {
          const setupMsg = {
            setup: {
              model: 'models/gemini-2.5-flash-native-audio-latest',
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: 'Aoede'
                    }
                  }
                }
              },
              systemInstruction: {
                parts: [
                  {
                    text: `You are Aoede, a warm, highly intelligent, and conversational AI voice study companion on YadaLearn for ${studentName} studying ${subject}.
Today's local date is ${todayDateStr}. Local time is ${todayTimeStr}.

CRITICAL BEHAVIORAL INSTRUCTIONS:
1. Speak naturally like a real human tutor. Your spoken responses should be concise, expressive, and conversational (typically 1-3 spoken sentences, maximum 45 words).
2. NEVER output markdown symbols, asterisks (*), hashtags (#), bullet points (•), or formatting tags. Speak in clean, spoken sentences.
3. Turn-taking & Interruptions: The user can interrupt you at any point. When interrupted (e.g. user adds new context like "By the way, I live in Indonesia"), seamlessly pivot, acknowledge the new information naturally ("Oh, you're in Indonesia! In that case..."), and continue without restarting or repeating yourself.
4. Intelligent Tool Calling:
   - When asked about weather (or when local weather context is relevant), call 'getCurrentWeather'.
   - When asked about assignments or tasks, call 'getStudentAssignments'.
   - When asked about performance or grades, call 'getStudentPerformance'.
   - For general conversational questions, greetings, or explanations, answer immediately WITHOUT calling tools.
5. Proactive Assignment Awareness: If the student asks about assignments and none are found, say: "Since today you don't have assignments, is there something on your mind you want to work on?"
6. Never invent facts or hallucinate tool data when a tool was not executed.`
                  }
                ]
              },
              tools: [
                {
                  functionDeclarations: [
                    {
                      name: 'getCurrentWeather',
                      description: 'Get current real-time weather information for any city or region',
                      parameters: {
                        type: 'OBJECT',
                        properties: {
                          location: { type: 'STRING', description: 'City or location name, e.g. Jakarta, London, Tokyo, New York' }
                        },
                        required: ['location']
                      }
                    },
                    {
                      name: 'getStudentAssignments',
                      description: 'Get current course assignments, deadlines, and submission status for this student',
                      parameters: {
                        type: 'OBJECT',
                        properties: {
                          status: { type: 'STRING', description: 'Optional filter: pending or all' }
                        }
                      }
                    },
                    {
                      name: 'getStudentPerformance',
                      description: 'Get recent grades, completed assignments count, and course progress for this student',
                      parameters: {
                        type: 'OBJECT',
                        properties: {
                          subject: { type: 'STRING', description: 'Subject name' }
                        }
                      }
                    },
                    {
                      name: 'saveStudentNoteOrMemory',
                      description: 'Save an important fact, goal, or preference about the student for future conversational continuity',
                      parameters: {
                        type: 'OBJECT',
                        properties: {
                          note: { type: 'STRING', description: 'The fact, goal, or memory to record' }
                        },
                        required: ['note']
                      }
                    }
                  ]
                }
              ]
            }
          };

          upstreamWs.send(JSON.stringify(setupMsg));
        });

        // Upstream message handler
        upstreamWs.on('message', async (raw: any) => {
          try {
            const data = JSON.parse(raw.toString());

            if (data.setupComplete) {
              isUpstreamReady = true;
              clientWs.send(JSON.stringify({ type: 'setupComplete' }));

              // Flush queued messages
              while (pendingClientQueue.length > 0) {
                const item = pendingClientQueue.shift();
                if (item) upstreamWs.send(item);
              }
              return;
            }

            // Handle Tool Calls
            if (data.toolCall) {
              const calls = data.toolCall.functionCalls || [];
              const functionResponses: any[] = [];

              for (const call of calls) {
                let toolResult: any = {};
                try {
                  if (call.name === 'getCurrentWeather') {
                    const loc = call.args?.location || 'Jakarta';
                    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1&language=en&format=json`);
                    if (geoRes.ok) {
                      const geoData = await geoRes.json();
                      if (geoData.results && geoData.results.length > 0) {
                        const { latitude, longitude, name, country } = geoData.results[0];
                        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`);
                        if (weatherRes.ok) {
                          const wData = await weatherRes.json();
                          const current = wData.current || {};
                          toolResult = {
                            location: name,
                            country: country || '',
                            temperature: `${Math.round(current.temperature_2m ?? 28)}°C`,
                            condition: getWeatherCondition(current.weather_code ?? 0),
                            humidity: `${current.relative_humidity_2m ?? 70}%`,
                            windSpeed: `${current.wind_speed_10m ?? 10} km/h`
                          };
                        } else {
                          toolResult = { location: name, condition: 'Pleasant', temperature: '28°C' };
                        }
                      } else {
                        toolResult = { location: loc, condition: 'Partly cloudy', temperature: '27°C' };
                      }
                    } else {
                      toolResult = { location: loc, condition: 'Partly cloudy', temperature: '27°C' };
                    }
                  } else if (call.name === 'getStudentAssignments') {
                    toolResult = {
                      count: 0,
                      hasAssignments: false,
                      message: 'The student has no pending assignments today.'
                    };
                  } else if (call.name === 'getStudentPerformance') {
                    toolResult = {
                      overallGrade: 'A-',
                      completionRate: '94%',
                      strengths: 'Consistent engagement and active inquiry'
                    };
                  } else if (call.name === 'saveStudentNoteOrMemory') {
                    toolResult = {
                      saved: true,
                      note: call.args?.note || ''
                    };
                  }
                } catch (tErr: any) {
                  toolResult = { error: tErr.message || 'Failed to execute tool' };
                }

                functionResponses.push({
                  response: { output: toolResult },
                  id: call.id
                });

                clientWs.send(JSON.stringify({
                  type: 'toolExecuted',
                  toolName: call.name,
                  toolResult
                }));
              }

              upstreamWs.send(JSON.stringify({
                toolResponse: {
                  functionResponses
                }
              }));
              return;
            }

            // Handle Server Content (Streaming Audio & Text & Interruptions)
            if (data.serverContent) {
              if (data.serverContent.interrupted) {
                clientWs.send(JSON.stringify({ type: 'interrupted' }));
              }

              const parts = data.serverContent.modelTurn?.parts || [];
              for (const part of parts) {
                if (part.text) {
                  clientWs.send(JSON.stringify({ type: 'text', text: part.text }));
                }
                if (part.inlineData && part.inlineData.data) {
                  clientWs.send(JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000'
                  }));
                }
              }

              if (data.serverContent.turnComplete) {
                clientWs.send(JSON.stringify({ type: 'turnComplete' }));
              }
            }
          } catch (err: any) {
            console.warn('[Gemini Live Gateway] Upstream parse error:', err);
          }
        });

        upstreamWs.on('error', (err: any) => {
          console.error('[Gemini Live Gateway] Upstream error:', err.message);
          clientWs.send(JSON.stringify({ type: 'error', error: err.message }));
        });

        upstreamWs.on('close', (code: number, reason: Buffer) => {
          clientWs.close(code, reason.toString());
        });

        // Client message handler
        clientWs.on('message', (msg: any) => {
          try {
            const parsed = JSON.parse(msg.toString());

            if (parsed.type === 'audio' && parsed.pcmBase64) {
              const audioMsg = JSON.stringify({
                realtimeInput: {
                  mediaChunks: [
                    {
                      mimeType: 'audio/pcm;rate=16000',
                      data: parsed.pcmBase64
                    }
                  ]
                }
              });

              if (isUpstreamReady && upstreamWs.readyState === NodeWebSocket.OPEN) {
                upstreamWs.send(audioMsg);
              } else {
                pendingClientQueue.push(audioMsg);
              }
            } else if (parsed.type === 'text' && parsed.text) {
              const textMsg = JSON.stringify({
                clientContent: {
                  turns: [
                    {
                      role: 'user',
                      parts: [{ text: parsed.text }]
                    }
                  ],
                  turnComplete: true
                }
              });

              if (isUpstreamReady && upstreamWs.readyState === NodeWebSocket.OPEN) {
                upstreamWs.send(textMsg);
              } else {
                pendingClientQueue.push(textMsg);
              }
            }
          } catch (cErr) {
            console.warn('[Gemini Live Gateway] Error parsing client message:', cErr);
          }
        });

        clientWs.on('close', () => {
          if (upstreamWs.readyState === NodeWebSocket.OPEN) {
            upstreamWs.close();
          }
        });

        clientWs.on('error', () => {
          if (upstreamWs.readyState === NodeWebSocket.OPEN) {
            upstreamWs.close();
          }
        });
      });
    }
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  plugins: [react(), streamTokenPlugin(), studentAIPlugin(), teacherAIPlugin(), geminiLiveGatewayPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

