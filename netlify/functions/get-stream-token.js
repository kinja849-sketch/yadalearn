import jwt from 'jsonwebtoken';

export async function handler(event, context) {
  const secret = process.env.STREAM_SECRET || process.env.STREAM_SECRET_KEY || process.env.VITE_STREAM_SECRET || process.env.STREAM_API_SECRET;

  if (!secret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "STREAM_SECRET not found in environment" }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  const userId = event.queryStringParameters?.user_id;
  const userRole = event.queryStringParameters?.role || 'user';
  const streamRole = userRole === 'teacher' ? 'admin' : 'user';

  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "user_id query parameter is required" }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  try {
    // Create Stream JWT
    const token = jwt.sign({ user_id: userId, role: streamRole }, secret, { algorithm: 'HS256', noTimestamp: true });
    
    return {
      statusCode: 200,
      body: JSON.stringify({ token }),
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
}

