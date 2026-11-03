const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '300kb' }));
app.use(express.static(path.join(__dirname, 'public')));

let dbPath = process.env.DB_PATH || 'study.db';
try {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);
} catch (e) {
  console.warn('DB folder not writable, using local study.db');
  dbPath = 'study.db';
}
const db = new Database(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS lessons(
  id INTEGER PRIMARY KEY, cls TEXT, subject TEXT, title TEXT, body TEXT, quiz TEXT, t INTEGER
)`);

const SEED = [
  {
    cls: '8', subject: 'गणित', title: 'वर्ग और वर्गमूल',
    body: 'जब कोई संख्या अपने आप से गुणा की जाती है, तो मिलने वाली संख्या उसका वर्ग कहलाती है। जैसे 5 × 5 = 25, इसलिए 5 का वर्ग 25 है।\n\nवर्गमूल वर्ग का उल्टा है। 25 का वर्गमूल 5 है, क्योंकि 5 × 5 = 25। वर्गमूल को √ चिह्न से लिखते हैं, जैसे √25 = 5।\n\nकुछ वर्ग संख्याएँ याद रखें: 1, 4, 9, 16, 25, 36, 49, 64, 81, 100।',
    quiz: [
      { q: '7 का वर्ग क्या है?', o: ['14', '49', '56', '77'], a: 1 },
      { q: '√64 कितना है?', o: ['6', '7', '8', '9'], a: 2 },
      { q: 'इनमें से कौन सी पूर्ण वर्ग संख्या है?', o: ['20', '25', '30', '35'], a: 1 },
      { q: '12 × 12 कितना होता है?', o: ['124', '132', '144', '156'], a: 2 }
    ]
  },
  {
    cls: '8', subject: 'विज्ञान', title: 'प्रकाश संश्लेषण',
    body: 'प्रकाश संश्लेषण वह क्रिया है जिससे हरे पौधे अपना भोजन खुद बनाते हैं। इसके लिए पौधों को सूर्य का प्रकाश, पानी और कार्बन डाइऑक्साइड चाहिए।\n\nपत्तियों में क्लोरोफिल नाम का हरा पदार्थ होता है, जो सूर्य का प्रकाश सोखता है। इसी वजह से पत्तियाँ हरी दिखती हैं।\n\nइस क्रिया में पौधे ग्लूकोज़ (एक तरह की शर्करा) बनाते हैं और ऑक्सीजन छोड़ते हैं, जिसे हम साँस में लेते हैं।',
    quiz: [
      { q: 'प्रकाश संश्लेषण में पौधे कौन सी गैस छोड़ते हैं?', o: ['कार्बन डाइऑक्साइड', 'ऑक्सीजन', 'नाइट्रोजन', 'हाइड्रोजन'], a: 1 },
      { q: 'पत्तियों का हरा पदार्थ कौन सा है?', o: ['क्लोरोफिल', 'ग्लूकोज़', 'स्टार्च', 'प्रोटीन'], a: 0 },
      { q: 'पौधे अपना भोजन किस क्रिया से बनाते हैं?', o: ['साँस लेना', 'प्रकाश संश्लेषण', 'वाष्पोत्सर्जन', 'अंकुरण'], a: 1 }
    ]
  }
];
if (db.prepare('SELECT COUNT(*) AS n FROM lessons').get().n === 0) {
  const ins = db.prepare('INSERT INTO lessons(cls,subject,title,body,quiz,t) VALUES(?,?,?,?,?,?)');
  SEED.forEach(l => ins.run(l.cls, l.subject, l.title, l.body, JSON.stringify(l.quiz), Date.now()));
}

const hits = new Map();
function limited(key, max) {
  const now = Date.now();
  const a = (hits.get(key) || []).filter(x => now - x < 3600e3);
  a.push(now); hits.set(key, a);
  return a.length > max;
}
function isAdmin(req) {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) return false;
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(p), h(req.get('x-admin') || ''));
}
function needAdmin(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: 'सर्वर पर ADMIN_PASSWORD नहीं लगा है।' });
  if (limited('a' + req.ip, 40)) return res.status(429).json({ error: 'बहुत ज़्यादा कोशिशें। थोड़ी देर बाद करें।' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'पासवर्ड गलत है।' });
  next();
}

app.get('/api/classes', (req, res) =>
  res.json(db.prepare('SELECT DISTINCT cls FROM lessons ORDER BY CAST(cls AS INTEGER), cls').all().map(r => r.cls)));

app.get('/api/lessons', (req, res) => {
  const cls = String(req.query.cls || '');
  const rows = cls
    ? db.prepare('SELECT id,cls,subject,title FROM lessons WHERE cls=? ORDER BY subject,id').all(cls)
    : db.prepare('SELECT id,cls,subject,title FROM lessons ORDER BY cls,subject,id').all();
  res.json(rows);
});

app.get('/api/lessons/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'पाठ नहीं मिला।' });
  let quiz = [];
  try { quiz = JSON.parse(r.quiz); } catch (e) {}
  res.json({ id: r.id, cls: r.cls, subject: r.subject, title: r.title, body: r.body, quiz });
});

app.post('/api/admin/check', needAdmin, (req, res) => res.json({ ok: true }));

app.post('/api/admin/lessons', needAdmin, (req, res) => {
  const { cls, subject, title, body, quiz } = req.body || {};
  const s = (v, n) => typeof v === 'string' && v.trim().length > 0 && v.length <= n;
  if (!s(cls, 10) || !s(subject, 30) || !s(title, 100) || !s(body, 20000)) return res.status(400).json({ error: 'कक्षा, विषय, शीर्षक और पाठ भरें।' });
  const qs = Array.isArray(quiz) ? quiz : [];
  if (qs.length > 20) return res.status(400).json({ error: 'सवाल 20 से ज़्यादा नहीं हो सकते।' });
  for (const q of qs) {
    if (!q || typeof q.q !== 'string' || !Array.isArray(q.o) || q.o.length < 2 || q.o.length > 4 ||
        !q.o.every(x => typeof x === 'string' && x.length <= 200) || !Number.isInteger(q.a) || q.a < 0 || q.a >= q.o.length)
      return res.status(400).json({ error: 'सवाल का रूप गलत है।' });
  }
  const r = db.prepare('INSERT INTO lessons(cls,subject,title,body,quiz,t) VALUES(?,?,?,?,?,?)')
    .run(cls.trim(), subject.trim(), title.trim(), body, JSON.stringify(qs), Date.now());
  res.status(201).json({ id: r.lastInsertRowid });
});

app.delete('/api/admin/lessons/:id', needAdmin, (req, res) => {
  db.prepare('DELETE FROM lessons WHERE id=?').run(req.params.id);
  res.sendStatus(204);
});

app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.status === 413 ? 'पाठ बहुत बड़ा है।' : 'सर्वर में दिक्कत।' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Study India running on port ' + port));
