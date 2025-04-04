// Arabic quiz questions with multiple choice answers
const quizQuestions = [
    {
        question: "ما هي عاصمة المملكة العربية السعودية؟",
        options: ["جدة", "الرياض", "مكة", "المدينة"],
        correctAnswer: 1, // Index of correct answer (Riyadh)
        difficulty: "easy"
    },
    {
        question: "من هو مؤلف كتاب 'مقدمة ابن خلدون'؟",
        options: ["ابن سينا", "الفارابي", "ابن خلدون", "الغزالي"],
        correctAnswer: 2, // Ibn Khaldun
        difficulty: "medium"
    },
    {
        question: "كم عدد الكواكب في المجموعة الشمسية؟",
        options: ["7", "8", "9", "10"],
        correctAnswer: 1, // 8 planets
        difficulty: "easy"
    },
    {
        question: "ما هو أطول نهر في العالم؟",
        options: ["النيل", "الأمازون", "المسيسيبي", "اليانغتسي"],
        correctAnswer: 0, // Nile
        difficulty: "medium"
    },
    {
        question: "في أي عام تأسست منظمة الأمم المتحدة؟",
        options: ["1945", "1950", "1955", "1960"],
        correctAnswer: 0, // 1945
        difficulty: "medium"
    },
    {
        question: "ما هي أكبر دولة عربية من حيث المساحة؟",
        options: ["مصر", "السعودية", "الجزائر", "السودان"],
        correctAnswer: 2, // Algeria
        difficulty: "medium"
    },
    {
        question: "ما هو العنصر الكيميائي الذي رمزه 'O'؟",
        options: ["الأكسجين", "الذهب", "الفضة", "الأوزون"],
        correctAnswer: 0, // Oxygen
        difficulty: "easy"
    },
    {
        question: "من هو مخترع المصباح الكهربائي؟",
        options: ["نيكولا تسلا", "توماس إديسون", "ألبرت أينشتاين", "غراهام بيل"],
        correctAnswer: 1, // Edison
        difficulty: "easy"
    },
    {
        question: "ما هي أصغر قارة في العالم؟",
        options: ["أوروبا", "أستراليا", "أنتاركتيكا", "أمريكا الشمالية"],
        correctAnswer: 1, // Australia
        difficulty: "medium"
    },
    {
        question: "ما هو الحيوان الذي يظهر على شعار فيراري؟",
        options: ["الثور", "الحصان", "النمر", "الأسد"],
        correctAnswer: 1, // Horse
        difficulty: "medium"
    },
    {
        question: "كم عدد أضلاع المسدس؟",
        options: ["5", "6", "7", "8"],
        correctAnswer: 1, // 6
        difficulty: "easy"
    },
    {
        question: "ما هي اللغة الرسمية في البرازيل؟",
        options: ["الإسبانية", "البرتغالية", "الإنجليزية", "الفرنسية"],
        correctAnswer: 1, // Portuguese
        difficulty: "medium"
    },
    {
        question: "من هو مؤسس شركة مايكروسوفت؟",
        options: ["ستيف جوبز", "مارك زوكربيرج", "بيل غيتس", "إيلون ماسك"],
        correctAnswer: 2, // Bill Gates
        difficulty: "easy"
    },
    {
        question: "ما هي أكبر صحراء في العالم؟",
        options: ["صحراء غوبي", "الصحراء الكبرى", "صحراء أتاكاما", "صحراء القطب الجنوبي"],
        correctAnswer: 3, // Antarctic Desert
        difficulty: "hard"
    },
    {
        question: "ما هو العنصر الأكثر وفرة في القشرة الأرضية؟",
        options: ["الحديد", "السيليكون", "الأكسجين", "الألومنيوم"],
        correctAnswer: 2, // Oxygen
        difficulty: "hard"
    },
    {
        question: "من هو مؤلف رواية 'الحرب والسلام'؟",
        options: ["فيودور دوستويفسكي", "ليو تولستوي", "أنطون تشيخوف", "إيفان تورجينيف"],
        correctAnswer: 1, // Leo Tolstoy
        difficulty: "hard"
    },
    {
        question: "ما هو أسرع حيوان بري في العالم؟",
        options: ["الفهد", "النمر", "الأسد", "الغزال"],
        correctAnswer: 0, // Cheetah
        difficulty: "easy"
    },
    {
        question: "في أي عام وقعت معركة حطين؟",
        options: ["1187", "1190", "1200", "1215"],
        correctAnswer: 0, // 1187
        difficulty: "hard"
    },
    {
        question: "ما هي عملة اليابان؟",
        options: ["الوون", "اليوان", "الين", "الرينغيت"],
        correctAnswer: 2, // Yen
        difficulty: "medium"
    },
    {
        question: "من هو مكتشف قانون الجاذبية؟",
        options: ["ألبرت أينشتاين", "إسحاق نيوتن", "غاليليو غاليلي", "نيكولا تسلا"],
        correctAnswer: 1, // Newton
        difficulty: "easy"
    }
];

// Function to get questions by difficulty
function getQuestionsByDifficulty(difficulty) {
    return quizQuestions.filter(q => q.difficulty === difficulty);
}


// Function to get random questions
function getRandomQuestions(count, difficulty = null) {
    let questions = difficulty ? getQuestionsByDifficulty(difficulty) : [...quizQuestions];
    
    // Shuffle the questions
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    
    // Return the requested number of questions or all if count is greater
    return questions.slice(0, Math.min(count, questions.length));
}

// Function to add a new question to the collection
function addQuestion(question, options, correctAnswer, difficulty = "medium") {
    const newQuestion = {
        question,
        options,
        correctAnswer,
        difficulty
    };
    
    quizQuestions.push(newQuestion);
    return newQuestion;
}

// Function to get all available difficulties
function getAvailableDifficulties() {
    const difficulties = new Set();
    quizQuestions.forEach(q => difficulties.add(q.difficulty));
    return Array.from(difficulties);
}

module.exports = {
    quizQuestions,
    getQuestionsByDifficulty,
    getRandomQuestions,
    addQuestion,
    getAvailableDifficulties
};