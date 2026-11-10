# 📚 Sir Mahee Learning World

स्टूडेंट्स के लिए एक **मुफ़्त** एजुकेशन प्लेटफ़ॉर्म: कोर्स, स्टडी मटीरियल, क्विज़, AI डाउट-सॉल्वर, लाइव क्लास और बहुत कुछ।
हर स्टूडेंट अपने फ़ोन से लॉगिन करके पढ़ता है, और टीचर ऐप के अंदर से ही कंटेंट डालता है।

## तकनीक (सब कुछ मुफ़्त प्लान पर)

| काम | सेवा |
|---|---|
| ऐप की होस्टिंग | GitHub Pages |
| लॉगिन, डेटाबेस, फ़ाइल स्टोरेज | Supabase (Free plan) |
| AI (Doubt Solver, Photo Solver आदि) | Gemini API (फ्री टियर), Supabase Edge Function के ज़रिए: Step 4 |
| वीडियो और लाइव क्लास | YouTube (unlisted) और Google Meet के लिंक |

## फ़ाइलों का क्रम

```
learning-world/
├── README.md               1. यह फ़ाइल: प्रोजेक्ट की जानकारी
├── index.html              2. मुख्य पेज, सब फ़ाइलों को जोड़ता है
├── css/
│   └── style.css           3. डिज़ाइन और थीम (क्रीम + गोल्ड + नेवी)
├── js/
│   ├── config.js           4. Supabase सेटिंग (URL और publishable key)
│   ├── app.js              5. ऐप का मुख्य कोड: पेज, पॉपअप, क्विज़, प्लानर, सेटिंग्स
│   └── auth.js             6. लॉगिन, प्रोफ़ाइल, Announcements, Notifications
└── database/
    └── step1-database.sql  7. डेटाबेस, Supabase में सिर्फ़ एक बार चलाना है
```

आगे के Steps में `js/` में नई फ़ाइलें जुड़ेंगी (जैसे `materials.js`, `quiz.js`, `ai.js`)।

## शुरू करने का तरीका

1. **Supabase:** अपने प्रोजेक्ट में SQL Editor खोलकर `database/step1-database.sql` की पूरी सामग्री चलाएँ।
2. **Supabase:** Authentication → Providers → Email में **Confirm email** फ़िलहाल बंद करें।
3. **GitHub:** सारी फ़ाइलें इस रिपॉज़िटरी में डालें, फिर Settings → Pages → Branch `main` / `(root)` चुनकर Save करें।
4. ऐप खोलकर अपना अकाउंट बनाएँ, फिर SQL Editor में चलाएँ:
   `update public.profiles set role='teacher' where id=(select id from auth.users where email='आपका@ईमेल');`

## सुरक्षा के नियम

- Gemini API key, `secret` key या `service_role` key को **कभी भी** इस रिपॉज़िटरी में न डालें।
- `js/config.js` में सिर्फ़ Supabase का URL और **publishable** key रहती है, जिसका सार्वजनिक होना सुरक्षित है।
- रिपॉज़िटरी Public है (GitHub Pages के फ्री प्लान के लिए ज़रूरी)। इसमें स्टूडेंट्स का कोई निजी डेटा न रखें।
- स्टूडेंट्स का डेटा Supabase में रहता है और Row Level Security से सुरक्षित है।

## प्रगति

- [x] **Step 1:** लॉगिन, प्रोफ़ाइल, Announcements, Notifications
- [x] **इंटरफ़ेस:** क्रीम-गोल्ड थीम, पॉपअप एनिमेशन, क्विज़, प्लानर, AI चैट (प्रीव्यू), सेटिंग्स
- [ ] **Step 2:** My Courses, Study Materials, Downloads, Bookmarks, Timetable, Study Planner, Assignments
- [ ] **Step 3:** Quiz & Practice, Board Exam Practice, Progress, Leaderboard, Achievements
- [ ] **Step 4:** Gemini AI: Doubt Solver, Photo Solver, Question Generator, Voice Tutor, English Speaking
- [ ] **Step 5:** Live Classes, Chat, Help & Support
- [ ] **Step 6:** सुरक्षा जाँच, टेस्टिंग, अंतिम पब्लिश

## मुफ़्त प्लान की सीमाएँ

- Supabase Free: 500 MB डेटाबेस और 1 GB फ़ाइल स्टोरेज। बड़े वीडियो YouTube पर रखें।
- Supabase का फ्री प्रोजेक्ट एक हफ़्ता बेकार रहे तो पॉज़ हो जाता है। Dashboard से एक क्लिक में दोबारा चालू होता है।
- Gemini का फ्री टियर रेट-लिमिट वाला है, और उस पर भेजा कंटेंट Google अपने प्रोडक्ट सुधारने में इस्तेमाल कर सकता है। इसलिए AI को स्टूडेंट्स की निजी जानकारी नहीं भेजी जाएगी।
