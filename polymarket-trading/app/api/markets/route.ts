/**
 * API Route: /api/markets
 * 
 * Proxies requests to the Polymarket Gamma API to avoid CORS issues.
 */

import { NextRequest, NextResponse } from 'next/server';

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    const limit = searchParams.get('limit') || '100';
    const offset = searchParams.get('offset') || '0';
    const active = searchParams.get('active') || 'true';
    const closed = searchParams.get('closed') || 'false';

    try {
        const response = await fetch(
            `${GAMMA_API_URL}/markets?limit=${limit}&offset=${offset}&active=${active}&closed=${closed}`,
            {
                headers: {
                    'Accept': 'application/json',
                },
                // Cache for 60 seconds
                next: { revalidate: 60 },
            }
        );

        if (!response.ok) {
            return NextResponse.json(
                { error: `Gamma API error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error proxying Gamma API:', error);
        return NextResponse.json(
            { error: 'Failed to fetch markets' },
            { status: 500 }
        );
    }
}
