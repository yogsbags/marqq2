import asyncio
import httpx
import json
import os

ARTIFACT_TYPES = [
    'website_audit', 'opportunities',
    'client_profiling', 'partner_profiling', 'icps',
    'social_calendar', 'marketing_strategy', 'positioning_messaging',
    'sales_enablement', 'pricing_intelligence', 'content_strategy',
    'channel_strategy', 'lookalike_audiences', 'lead_magnets'
]

PAYLOAD = {
  "company_name": "Prabhudas Lilladher",
  "company_url": "https://www.plindia.com",
  "inputs": {
    "geo": "India"
  },
  "company_profile": {
    "industry": "Financial Services / Wealth Management",
    "geoFocus": ["India"],
    "summary": "Prabhudas Lilladher is one of the most trusted financial services organizations in India."
  }
}

async def test_module(client, artifact_type):
    payload = PAYLOAD.copy()
    payload["artifact_type"] = artifact_type
    try:
        response = await client.post("http://localhost:8002/api/crewai/company-intel/generate", json=payload, timeout=120.0)
        data = response.json()
        print(f"✅ {artifact_type} completed (Status: {response.status_code})")
        return artifact_type, data
    except Exception as e:
        print(f"❌ {artifact_type} failed: {e}")
        return artifact_type, {"error": str(e)}

async def main():
    results = {}
    async with httpx.AsyncClient() as client:
        # We'll run them in batches of 3 to avoid overwhelming the server/rate limits
        for i in range(0, len(ARTIFACT_TYPES), 3):
            batch = ARTIFACT_TYPES[i:i+3]
            print(f"\nRunning batch: {batch}")
            tasks = [test_module(client, artifact_type) for artifact_type in batch]
            batch_results = await asyncio.gather(*tasks)
            for artifact_type, data in batch_results:
                results[artifact_type] = data
            await asyncio.sleep(2) # brief pause between batches

    with open('test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print("\nAll tests completed. Results saved to test_results.json")

if __name__ == "__main__":
    asyncio.run(main())
