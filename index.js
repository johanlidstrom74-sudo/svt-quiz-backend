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

// Hjälpfunktion för att blanda en array
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Kortar ner långa texter så de får plats i quizet
function truncate(text, maxLen = 220) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, "") + " …";
}

// Skapa quiz-frågor från RSS-poster
function buildQuiz(items, questionCount = 7) {
  // Använd bara artiklar som har både rubrik och någon form av ingress
  const usable = (items || []).filter(
    (it) => it && it.title && (it.contentSnippet || it.content)
  );

  if (usable.length < 4) {
    return []; // för få nyheter för vettigt quiz
  }

  const questions = [];
  const baseItems = [...usable];
  const maxQuestions = Math.min(questionCount, baseItems.length - 3);

  for (let q = 0; q < maxQuestions; q++) {
    const correctIndex = Math.floor(Math.random() * baseItems.length);
    const correctItem = baseItems[correctIndex];

    const correctSnippet = truncate(
      correctItem.contentSnippet || correctItem.content || ""
    );

    const otherItems = baseItems.filter((_, idx) => idx !== correctIndex);
    const shuffledOthers = shuffle(otherItems);

    // Välj frågetyp: A = “sammanfattning → rubrik”, B = “rubrik → sammanfattning”
    const useSummaryAsStem = Math.random() < 0.5;

    let questionText;
    let stemText;
    let options = [];
    let correctOptionIndex = 0;

    if (useSummaryAsStem) {
      // Typ A: visa sammanfattning, låt användaren välja rubriken
      questionText = "Vilken rubrik stämmer med den här sammanfattningen?";
      stemText = correctSnippet;

      const wrongTitles = shuffledOthers
        .filter((it) => it.title)
        .slice(0, 3)
        .map((it) => it.title);

      const rawOptions = shuffle([
        { text: correctItem.title, isCorrect: true },
        ...wrongTitles.map((t) => ({ text: t, isCorrect: false })),
      ]);

      options = rawOptions.map((o) => o.text);
      correctOptionIndex = rawOptions.findIndex((o) => o.isCorrect);
    } else {
      // Typ B: visa rubriken, låt användaren välja rätt sammanfattning
      questionText = "Vilken sammanfattning hör till den här rubriken?";
      stemText = correctItem.title;

      const wrongSnippets = shuffledOthers
        .map((it) => truncate(it.contentSnippet || it.content || ""))
        .filter((txt) => txt && txt !== correctSnippet)
        .slice(0, 3);

      const rawOptions = shuffle([
        { text: correctSnippet, isCorrect: true },
        ...wrongSnippets.map((t) => ({ text: t, isCorrect: false })),
      ]);

      options = rawOptions.map((o) => o.text);
      correctOptionIndex = rawOptions.findIndex((o) => o.isCorrect);
    }

    // Om vi inte fick ihop minst 2–3 alternativ, hoppa över den här frågan
    if (options.length < 2) continue;

    questions.push({
      id: q + 1,
      questionText,
      summary: stemText,      // frontend visar detta under frågetexten
      options,
      correctIndex: correctOptionIndex,
      link: correctItem.link,
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
