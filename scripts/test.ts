import { db } from "@/lib/db";

const author = await db.author.findFirst({
    select: {
        empires: {
            select: {
                transliteration: true,
                hijriStartYear: true,
                hijriEndYear: true,
                nameTranslations: {
                    select: {
                        locale: true,
                        text: true,
                    },
                    where: {
                        locale: 'ar',
                    },
                },
            },
        },
        regions: true,
    },
});
console.log(author?.empires.map(e => ({
    transliteration: e.transliteration,
    hijriStartYear: e.hijriStartYear,
    hijriEndYear: e.hijriEndYear,
    nameTranslations: e.nameTranslations.map(t => t.text),
})));