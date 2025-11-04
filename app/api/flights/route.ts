import { NextResponse } from 'next/server';
import flights from '@/data/flights.json';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from')?.toUpperCase();
  const to = searchParams.get('to')?.toUpperCase();
  const date = searchParams.get('date');

  let results = flights as any[];
  if (from) results = results.filter(f => f.from === from);
  if (to) results = results.filter(f => f.to === to);
  if (date) results = results.filter(f => f.date === date);

  return NextResponse.json({ flights: results });
}
