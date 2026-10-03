require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve frontend files from ../public
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'StudentSpend',
    timestamp: new Date().toISOString()
  });
});

// Public config
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    aiEnabled: !!(
      process.env.AI_API_KEY &&
      process.env.AI_API_URL
    )
  });
});

// AI Insights endpoint
app.post('/api/ai/insights', async (req, res) => {
  try {
    const { summary } = req.body;

    if (!summary || typeof summary !== 'object') {
      return res.status(400).json({
        error: 'Missing or invalid summary data'
      });
    }

    const apiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL || 'gemini-2.5-flash';

    if (!apiKey) {
      return res.json({
        insights: [
          'AI insights are not configured yet. Add AI_API_KEY to your environment variables.'
        ],
        fallback: true
      });
    }

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

    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

    const data = await response.json();

    let content =
      data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('Gemini response:', content);

    content = content
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

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

    if (!parsed || !Array.isArray(parsed.insights)) {
      console.error('Invalid insights format:', parsed);

      return res.json({
        insights: [
          'Keep tracking your expenses to build a clearer spending pattern.'
        ],
        fallback: true
      });
    }

    const insights = parsed.insights
      .filter(
        insight =>
          typeof insight === 'string' &&
          insight.trim().length > 0
      )
      .map(insight => insight.trim())
      .slice(0, 6);

    if (insights.length === 0) {
      return res.json({
        insights: [
          'Keep tracking your expenses to build a clearer spending pattern.'
        ],
        fallback: true
      });
    }

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


// Local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`StudentSpend is running at http://localhost:${PORT}`);
  });
}

// Vercel
module.exports = app;