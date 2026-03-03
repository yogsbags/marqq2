import asyncio
import httpx
import json

PAYLOADS = [
    {
        "module": "company",
        "user_request": "Analyze the company Prabhudas Lilladher (www.plindia.com)",
        "company_name": "Prabhudas Lilladher",
        "company_url": "https://www.plindia.com"
    },
    {
        "module": "competitor",
        "user_request": "Analyze competitors for Prabhudas Lilladher focusing on wealth management in India",
        "company_name": "Prabhudas Lilladher"
    },
    {
        "module": "lead",
        "user_request": "Score and enrich these leads for Prabhudas Lilladher's wealth management services",
        "company_name": "Prabhudas Lilladher",
        "lead_data": [
            {"company": "Reliance Industries", "contact": "Mukesh", "title": "MD", "revenue": "100B"},
            {"company": "Small local IT firm", "contact": "Rahul", "title": "Developer", "revenue": "1M"}
        ]
    }
]

async def test_crewai_module(client, payload):
    try:
        print(f"Starting CrewAI {payload['module']} crew...")
        response = await client.post("http://localhost:8002/api/crewai/execute", json=payload, timeout=300.0)
        print(f"✅ {payload['module']} crew completed - {response.status_code}")
        return payload['module'], response.json()
    except Exception as e:
        print(f"❌ {payload['module']} failed: {e}")
        return payload['module'], {"error": str(e)}

async def main():
    results = {}
    async with httpx.AsyncClient() as client:
        for payload in PAYLOADS:
            module, data = await test_crewai_module(client, payload)
            results[module] = data

    with open('/Users/yogs87/Downloads/sanity/projects/martech/scripts/test_crewai_results.json', 'w') as f:
        json.dump(results, f, indent=2)

if __name__ == '__main__':
    asyncio.run(main())
