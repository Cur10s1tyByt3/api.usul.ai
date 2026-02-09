/**
 * Example queries with translations for all supported locales
 * Structure: { [locale]: { [key]: { shortText: string, longText: string } } }
 */
export const EXAMPLE_QUERIES: Record<
  string,
  Record<string, { shortText: string; longText: string }>
> = {
  en: {
    one: {
      shortText: 'Explain Verse',
      longText: 'What does the ayah يمحق الله الربا mean?',
    },
    two: {
      shortText: 'Find Hadith',
      longText: 'What hadith mentions wudu and a river?',
    },
    three: {
      shortText: 'Meaning Elaboration',
      longText: "Elaborate on the meaning of 'tawakkul' beyond simple reliance.",
    },
    four: {
      shortText: 'Explore Books',
      longText: 'What are the main seerah books before Ibn Hisham?',
    },
  },
  ar: {
    one: {
      shortText: 'شرح الآية',
      longText: 'ماذا يعني قوله تعالى يمحق الله الربا؟',
    },
    two: {
      shortText: 'ابحث عن حديث',
      longText: 'أي حديث يذكر الوضوء والنهر؟',
    },
    three: {
      shortText: 'توضيح المعنى',
      longText: 'توسع في معنى "التوكل" بما يتجاوز الاعتماد البسيط.',
    },
    four: {
      shortText: 'استكشف الكتب',
      longText: 'ما هي الكتب الرئيسية في السيرة قبل ابن هشام؟',
    },
  },
  bn: {
    one: {
      shortText: 'আয়াত ব্যাখ্যা',
      longText: 'আয়াত يمحق الله الربا এর অর্থ কী?',
    },
    two: {
      shortText: 'হাদিস খুঁজুন',
      longText: 'কোন হাদিসে অজু এবং নদীর উল্লেখ আছে?',
    },
    three: {
      shortText: 'অর্থের ব্যাখ্যা',
      longText: "'তাওয়াক্কুল' এর অর্থ সাধারণ নির্ভরতার বাইরেও বিস্তারিত করুন।",
    },
    four: {
      shortText: 'বইগুলি অনুসন্ধান করুন',
      longText: 'ইবনে হিশামের আগে প্রধান সীরাহ বইগুলি কী কী?',
    },
  },
  es: {
    one: {
      shortText: 'Explicar Versículo',
      longText: '¿Qué significa la ayah يمحق الله الربا?',
    },
    two: {
      shortText: 'Encontrar Hadith',
      longText: '¿Qué hadith menciona el wudu y un río?',
    },
    three: {
      shortText: 'Elaboración del Significado',
      longText: "Elaborar sobre el significado de 'tawakkul' más allá de la simple dependencia.",
    },
    four: {
      shortText: 'Explorar Libros',
      longText: '¿Cuáles son los principales libros de seerah antes de Ibn Hisham?',
    },
  },
  fa: {
    one: {
      shortText: 'توضیح آیه',
      longText: 'آیه "یمحق الله الربا" چه معنایی دارد؟',
    },
    two: {
      shortText: 'یافتن حدیث',
      longText: 'کدام حدیث به وضو و رودخانه اشاره دارد؟',
    },
    three: {
      shortText: 'آشکار سازی معنی',
      longText: 'معنی «توکل» را فراتر از اعتماد ساده توضیح دهید.',
    },
    four: {
      shortText: 'بررسی کتاب‌ها',
      longText: 'کتاب‌های اصلی سیره قبل از ابن هشام کدامند؟',
    },
  },
  fr: {
    one: {
      shortText: 'Expliquer le verset',
      longText: "Que signifie l'ayah يمحق الله الربا ?",
    },
    two: {
      shortText: 'Trouver Hadith',
      longText: 'Quel hadith mentionne les ablutions et une rivière ?',
    },
    three: {
      shortText: 'Élaboration du sens',
      longText: "Élaborez sur le sens de 'tawakkul' au-delà de la simple confiance.",
    },
    four: {
      shortText: 'Explorer les livres',
      longText: 'Quels sont les principaux livres de sira avant Ibn Hisham ?',
    },
  },
  ha: {
    one: {
      shortText: 'Fassara Aya',
      longText: 'Menene ayah يمحق الله الربا yake nufi?',
    },
    two: {
      shortText: 'Nemo Hadisi',
      longText: 'Wane hadisi ne yake ambata wudu da kogin?',
    },
    three: {
      shortText: 'Karin Bayani',
      longText: "Yi bayani akan ma'anar 'tawakkul' fiye da dogaro mai sauki.",
    },
    four: {
      shortText: 'Bincika Littattafai',
      longText: 'Menene manyan littattafan seerah kafin Ibn Hisham?',
    },
  },
  hi: {
    one: {
      shortText: 'श्लोक की व्याख्या',
      longText: 'उस आयत يمحق الله الربا का क्या अर्थ है?',
    },
    two: {
      shortText: 'हदीस खोजें',
      longText: 'कौन सी हदीस वुजू और नदी का उल्लेख करती है?',
    },
    three: {
      shortText: 'अर्थ की विस्तृत व्याख्या',
      longText: "'तवक्कुल' के अर्थ को साधारण निर्भरता से अधिक विस्तारित करें।",
    },
    four: {
      shortText: 'पुस्तकों का अन्वेषण करें',
      longText: 'इब्न हिशाम से पहले मुख्य सीरत पुस्तकें कौन सी हैं?',
    },
  },
  ms: {
    one: {
      shortText: 'Terangkan Ayat',
      longText: 'Apa maksud ayat يمحق الله الربا?',
    },
    two: {
      shortText: 'Cari Hadis',
      longText: 'Hadis mana yang menyebutkan wudu dan sungai?',
    },
    three: {
      shortText: 'Penjelasan Makna',
      longText: "Terangkan makna 'tawakkul' di luar kebergantungan mudah.",
    },
    four: {
      shortText: 'Terokai Buku',
      longText: 'Apakah buku seerah utama sebelum Ibn Hisham?',
    },
  },
  ps: {
    one: {
      shortText: 'آیت تشریح',
      longText: 'آیا د يمحق الله الربا معنی څه دی؟',
    },
    two: {
      shortText: 'حدیث پیدا کړئ',
      longText: 'کوم حدیث د اودس او یو سیند یادونه کوي؟',
    },
    three: {
      shortText: 'د معنی توضیحات',
      longText: 'په ساده اتکاء باندې د توکل د معنی توضیح وکړئ.',
    },
    four: {
      shortText: 'کتابونه وپلټئ',
      longText: 'د ابن الحیشام څخه مخکې د سیرت اصلی کتابونه کوم دي؟',
    },
  },
  ru: {
    one: {
      shortText: 'Объяснить аят',
      longText: 'Что означает аят يمحق الله الربا?',
    },
    two: {
      shortText: 'Найти хадис',
      longText: 'Какой хадис упоминает вуду и реку?',
    },
    three: {
      shortText: 'Пояснение значения',
      longText: "Подробно объяснить значение 'таваккуль' за пределами простого упования.",
    },
    four: {
      shortText: 'Изучить книги',
      longText: 'Какие основные книги по сире были до Ибн Хишама?',
    },
  },
  so: {
    one: {
      shortText: 'Sharaxaa aayadda',
      longText: 'Aayadda يمحق الله الربا macnaheedu waa maxay?',
    },
    two: {
      shortText: 'Raadi Xadiis',
      longText: 'Xadiiska kee xusay wudu iyo webi?',
    },
    three: {
      shortText: 'Faahfaahinta Macnaha',
      longText: "Faahfaahi macnaha 'tawakkul' ka baxsan kalsooni fudud.",
    },
    four: {
      shortText: 'Baadh Buugaag',
      longText: 'Maxay yihiin buugaagta seerah ee ugu weyn kahor Ibn Hisham?',
    },
  },
  tr: {
    one: {
      shortText: 'Ana Cümleyi Açıkla',
      longText: 'Allah, faizi yok eder anlamına gelen ayet ne anlatıyor?',
    },
    two: {
      shortText: 'Hadis Bul',
      longText: 'Hangi hadis abdest ve nehirden bahseder?',
    },
    three: {
      shortText: 'Anlam Detayı',
      longText: "Basit güvenin ötesinde 'tevekkül'ün anlamını detaylandırın.",
    },
    four: {
      shortText: 'Kitapları Keşfet',
      longText: "İbn Hişam'dan önceki başlıca siyer kitapları nelerdir?",
    },
  },
  ur: {
    one: {
      shortText: 'آیت کی وضاحت',
      longText: 'آیت يمحق الله الربا کا مطلب کیا ہے؟',
    },
    two: {
      shortText: 'حدیث تلاش کریں',
      longText: 'کونسی حدیث وضو اور دریا کا ذکر کرتی ہے؟',
    },
    three: {
      shortText: 'معنی کی تفصیل',
      longText: "سیدھے انحصار سے آگے 'توکل' کے معنی کی وضاحت کریں۔",
    },
    four: {
      shortText: 'کتابیں دریافت کریں',
      longText: 'ابن ہشام سے پہلے کے اہم سیرت کے کتابیں کون سے ہیں؟',
    },
  },
};

/**
 * Get all example queries for a specific locale
 */
export const getExampleQueriesByLocale = (
  locale: string,
): Array<{ key: string; shortText: string; longText: string }> => {
  const queries = EXAMPLE_QUERIES[locale] || EXAMPLE_QUERIES.en;
  return Object.entries(queries).map(([key, value]) => ({
    key,
    shortText: value.shortText,
    longText: value.longText,
  }));
};

/**
 * Check if a query text matches any example query across all locales
 * This handles cases where the locale might be incorrectly detected
 */
export const isExampleQuery = (query: string, locale: string): boolean => {
  const normalized = query.trim().toLowerCase();
  
  // First check the specific locale
  const localeQueries = EXAMPLE_QUERIES[locale];
  if (localeQueries) {
    const isMatch = Object.values(localeQueries).some(
      exampleQuery => exampleQuery.longText.trim().toLowerCase() === normalized,
    );
    if (isMatch) {
      return true;
    }
  }
  
  // If not found in the specified locale, check all other locales
  // This handles cases where locale detection might be wrong
  for (const [loc, queries] of Object.entries(EXAMPLE_QUERIES)) {
    if (loc === locale) continue; // Already checked above
    
    const isMatch = Object.values(queries).some(
      exampleQuery => exampleQuery.longText.trim().toLowerCase() === normalized,
    );
    if (isMatch) {
      console.log(`Found example query in locale '${loc}' but was checking '${locale}'`);
      return true;
    }
  }
  
  return false;
};

/**
 * Get the example query key by its long text
 */
export const getExampleQueryKey = (
  query: string,
  locale: string,
): string | null => {
  const normalized = query.trim().toLowerCase();
  const queries = EXAMPLE_QUERIES[locale] || EXAMPLE_QUERIES.en;

  for (const [key, value] of Object.entries(queries)) {
    if (value.longText.trim().toLowerCase() === normalized) {
      return key;
    }
  }

  return null;
};
