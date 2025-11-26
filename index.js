const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const parser = new Parser();

const FEEDS = {
  sverige: 'https://www.svt.se/nyheter/sverige/rss.xml',
  varlden: 'https://www.svt.se/nyheter/varlden/rss.xml',
  vast: 'https://www.svt.se/nyheter/lokalt/vast/rss.xml'
};

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildQuiz(items, questionCount = 5) {
  const questions = [];
  const baseItems = [...items];

  if (baseItems.length < 4) {
    return [];
  }

  const maxQuestions = Math.min(questionCount, baseItems.length - 3);

  for (let q = 0; q < maxQuestions; q++) {
    const correctIndex = Math.floor(Math.random() * baseItems.length);
    const correctItem = baseItems[correctIndex];

    const otherItems = baseItems.filter((_, idx) => idx !== correctIndex);
    const shuffledOthers = shuffle(otherItems).slice(0, 3);

    const options = shuffle([
      { text: correctItem.title, isCorrect: true },
      ...shuffledOthers.map(item => ({
        text: item.title,
        isCorrect: false
      }))
    ]);

    const correctOptionIndex = options.findIndex(o => o.isCorrect);

    questions.push({
      id: q + 1,
      questionText: 'Vilken rubrik stämmer med den här sammanfattningen?',
      summary: correctItem.contentSnippet || correctItem.content || '',
      options: options.map(o => o.text),
      correctIndex: correctOptionIndex,
      link: correctItem.link
    });
  }

  return questions;
}

app.get('/api/quiz', async (req, res) => {
  const category = (req.query.category || 'sverige').toLowerCase();
  const feedUrl = FEEDS[category] || FEEDS.sverige;

  try {
    const feed = await parser.parseURL(feedUrl);

    const now = new Date();
    const todayStr = now.toDateString();

    const todaysItems = feed.items.filter(item => {
      const d = item.isoDate || item.pubDate;
      if (!d) return false;
      const dt = new Date(d);
      return dt.toDateString() === todayStr;
    });

    const itemsForQuiz =
      todaysItems.length >= 5 ? todaysItems : feed.items.slice(0, 20);

    const questions = buildQuiz(itemsForQuiz, 7);

    if (!questions.length) {
      return res.status(500).json({
        error: 'För få nyheter i flödet för att skapa ett quiz just nu.'
      });
    }

    res.json({
      category,
      feedUrl,
      generatedAt: new Date().toISOString(),
      questionCount: questions.length,
      questions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kunde inte hämta eller tolka RSS-flödet.' });
  }
});

app.listen(port, () => {
  console.log(`SVT-quiz backend kör på http://localhost:${port}`);
});
