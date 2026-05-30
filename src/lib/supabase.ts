import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const EDGE_FUNCTION_URL = `${supabaseUrl}/functions/v1/clock-operations`;

export async function callEdgeFunction(path: string, body?: Record<string, unknown>) {
  const response = await fetch(`${EDGE_FUNCTION_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}
