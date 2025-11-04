import { NextResponse } from 'next/server';
import hotels from '@/data/hotels.json';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get('city')?.toUpperCase();
  const minStars = Number(searchParams.get('minStars') ?? 0);

  let results = hotels as any[];
  if (city) results = results.filter(h => h.city.toUpperCase() === city);
  if (minStars) results = results.filter(h => h.stars >= minStars);

  return NextResponse.json({ hotels: results });
}
