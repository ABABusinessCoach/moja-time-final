import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/clock-operations`;

export async function callEdgeFunction(path: string, body?: Record<string, unknown>, authToken?: string) {
  const response = await fetch(`${EDGE_FUNCTION_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken || supabaseAnonKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    try {
      const errorData = await response.json();
      return { success: false, message: errorData.message || `Request failed (${response.status})` };
    } catch {
      return { success: false, message: `Request failed (${response.status})` };
    }
  }

  try {
    return await response.json();
  } catch {
    return { success: false, message: 'Invalid response from server' };
  }
}
