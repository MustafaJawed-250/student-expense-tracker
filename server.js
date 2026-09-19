require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'StudentSpend',
    timestamp: new Date().toISOString()
  });
});

// Public config (never expose secrets)
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    aiEnabled: !!(process.env.AI_API_KEY && process.env.AI_API_URL)
  });
});

// AI Insights endpoint — API key stays on server
app.post('/api/ai/insights', async (req, res) => {
  try {
    const { summary } = req.body;

    // Validate summary data
    if (!summary || typeof summary !== 'object') {
      return res.status(400).json({
        error: 'Missing or invalid summary data'
      });
    }

    // Gemini configuration
    const apiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL || 'gemini-2.5-flash';

    // Check API key
    if (!apiKey) {
      return res.json({
        insights: [
          'AI insights are not configured yet. Add AI_API_KEY to your .env file.'
        ],
        fallback: true
      });
    }

    // Prompt for Gemini
    const prompt = `
You are a friendly, non-judgmental financial coach for university students in Pakistan.

Currency: PKR (₨).

Analyze the student's spending summary and provide 3 to 5 short, practical and encouraging insights.

Focus on:
- Spending patterns
- Categories where the student spends the most
- Possible areas to save money
- Budget progress
- Simple and realistic suggestions

Do not criticize the student.
Do not make the response sound judgmental.
Do not claim to provide professional financial advice.

Student spending data:
${JSON.stringify(summary, null, 2)}

IMPORTANT:
Return ONLY valid JSON.
Do not use Markdown.
Do not use code fences.
Do not write any explanation outside the JSON.

Return exactly this structure:

{
  "insights": [
    "Short insight 1",
    "Short insight 2",
    "Short insight 3"
  ]
}
`;

    // Gemini API URL
    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Send request to Gemini
    const response = await fetch(apiUrl, {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],

        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
          responseMimeType: 'application/json'
        }
      })
    });

    // Handle Gemini API error
    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        'Gemini API error:',
        response.status,
        errorText
      );

      return res.json({
        insights: [
          'We could not reach the AI service right now. Your data is safe — please try again later.'
        ],
        fallback: true
      });
    }

    // Read Gemini response
    const data = await response.json();

    let content =
      data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('Gemini response:', content);

    // Remove Markdown code fences if Gemini adds them
    content = content
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    // Make sure Gemini actually returned something
    if (!content) {
      console.error('Gemini returned an empty response:', data);

      return res.json({
        insights: [
          'Keep tracking your expenses to build a clearer spending pattern.'
        ],
        fallback: true
      });
    }

    let parsed;

    // Parse JSON returned by Gemini
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      console.error('Invalid Gemini JSON:', content);

      return res.json({
        insights: [
          'Keep tracking your expenses to build a clearer spending pattern.'
        ],
        fallback: true
      });
    }

    // Validate insights array
    if (!parsed || !Array.isArray(parsed.insights)) {
      console.error('Invalid insights format:', parsed);

      return res.json({
        insights: [
          'Keep tracking your expenses to build a clearer spending pattern.'
        ],
        fallback: true
      });
    }

    // Clean insights
    const insights = parsed.insights
      .filter(
        insight =>
          typeof insight === 'string' &&
          insight.trim().length > 0
      )
      .map(insight => insight.trim())
      .slice(0, 6);

    // If Gemini returned no usable insights
    if (insights.length === 0) {
      return res.json({
        insights: [
          'Keep tracking your expenses to build a clearer spending pattern.'
        ],
        fallback: true
      });
    }

    // Successful response
    return res.json({
      insights,
      fallback: false
    });

  } catch (err) {
    console.error('AI insights error:', err);

    return res.json({
      insights: [
        'Something went wrong generating insights. Your transactions are still safe.'
      ],
      fallback: true
    });
  }
});
// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  StudentSpend is running at http://localhost:${PORT}\n`);
});
