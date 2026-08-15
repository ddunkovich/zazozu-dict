# Лингвистическое ревью PR #7

**Дата:** 2026-08-14  
**PR:** https://github.com/ddunkovich/zazozu-dict/pull/7  
**Файлы:** `source/pl/lemmas.jsonl` (+35 записей), `source/pl/proposed-lemmas.jsonl` (+1 запись)

---

## Итог: FAIL → исправлено в коммите `8c08f63`

---

## FAIL — критические ошибки (исправлено)

| Запись (было) | Поле | Ошибка | Исправление |
|---|---|---|---|
| `chętniej` | `lemma`, `entryKey`, `translations` | Лемма — сравнительная степень наречия; словарная форма — положительная | `lemma → "chętnie"`, `translations → "охотно, с удовольствием"` |
| `uciążliwej` | `lemma`, `entryKey`, `translations` | Лемма — род.п. ж.р.; канон — м.р. им.п. | `lemma → "uciążliwy"`, `translations → "обременительный, утомительный"` |
| `ulgę` | `lemma`, `entryKey` | Лемма — вин.п.; канон — им.п. | `lemma → "ulga"` |
| `zawołamy` | `lemma`, `entryKey`, `translations` | Лемма — 1л. мн.ч. будущего времени; канон — инфинитив | `lemma → "zawołać"`, `translations → "позвать, окликнуть, крикнуть"` |
| `zbędna` | `lemma`, `entryKey`, `translations` | Лемма — ж.р.; канон — м.р. им.п. | `lemma → "zbędny"`, `translations → "ненужный, излишний, лишний"` |
| `zebrać` | `translations`, `partOfSpeech`, `synonyms` | Перевод "собранных" — форма причастия; POS "imiesłów przymiotnikowy" — ошибка | `translations → "собрать"`, `POS → "czasownik"`, `synonyms → ["zgromadzić","pozbierać","skupić"]` |
| `istnieć` | `translations`, `partOfSpeech` | Переводы "существует, имеется" — спрягаемые формы, не инфинитивы | `translations → "существовать, иметься"`, `POS → "czasownik"` |
| `społeczny` | `translations` | Перевод "социальной" — форма рус. прилагательного в род.п. ж.р. | `translations → "социальный, общественный"` |
| `obóz` | `metadata.ruSimilarity` | 70 — ложный друг: рус. «обоз» = обозный поезд ≠ «лагерь» | `ruSimilarity → 10` |
| `istnieje` (proposed) | `lemma`, `entryKey` | Лемма — 3л. ед.ч.; канон — инфинитив | `lemma → "istnieć"` |

---

## WARN — некритические замечания (исправлено)

| Запись | Поле | Замечание | Исправление |
|---|---|---|---|
| `społeczny`, `poprzez` | `level` | A1 завышено для книжной/общественно-политической лексики | `level → "B1"` |
| `to` | `translations`, `wordForms` | "является" — перевод "jest"; wordForms включали склонение местоимения | `translations → "это (в роли связки)"`, `wordForms → ["to"]` |
| `miejsce` | `wordForms` | Отсутствовал им.п. "miejsce" в списке | добавлен `"miejsce"` в начало |
| `wiele` | `synonyms`, `wordForms` | "licznie" — не синоним; "wieluś" — архаизм/диалект | `synonyms → ["dużo","mnóstwo","sporo"]`, удалён "wieluś" |
| `czy` | `translations` | Только "или" (разделительный); пропущено значение частицы "ли" | `translations → "или (в разделительных вопросах); ли (в косвенных вопросах)"` |
| `grill` | `synonyms` | "barbecue" — английское слово; "piknik" — не синоним гриля | `synonyms → ["ruszt","rożen"]` |
| `wizerunek` | `translations` | "изображение" — вторичное значение; "образ, имидж" первичны | переупорядочено: `"образ, имидж, облик, изображение"` |
| `siemanko` | `synonyms` | "witaj" — формальный регистр, не сленговый синоним | `"witaj" → "hej"` |
| `sprawunek` | `translations` | "покупка" дублировалась дважды | убран дубль: `"покупка, приобретение, товар"` |
| `nieodzowny` | `wordForms` | Отсутствовала основная форма "nieodzowny" (м.р. им.п.) | добавлен `"nieodzowny"` в начало |
| `wdrożyć` | `wordForms` | Инфинитив "wdrożyć" отсутствовал в собственном списке | добавлен `"wdrożyć"` в начало |
| `zbędny` | `wordForms` | Отсутствовала форма "zbędna" (ж.р. им.п.) | добавлена `"zbędna"` |
| `frasunek`, `rozgardiasz` | `examples` | Примеры — неполные предложения (строчная буква, нет подлежащего) | исправлены до полных предложений |
| `ulga` | `translations` | Пропущено вторичное значение "льгота, скидка" | добавлено: `"облегчение, льгота"` |

---

## Записи без замечаний (PASS)

`wyjątkowy`, `ciekawość`, `relaks`, `browarnictwo`, `polski`, `nożny`, `wakacyjny`, `zdobyć`, `rzemieślniczy`, `browar`, `mitręga`, `potrwać`, `rywalizacja`

---

## Что осталось (не исправлялось — спорные суждения)

- `nożny` — используется почти исключительно в "piłka nożna"; возможно, лучше как коллокация, но решение оставлено автору
- `potrwać` — несовершенный вид в переводах ("длиться") при совершенном глаголе; семантически близко, оставлено
- Отсутствие `level`/`category`/`ruSimilarity` у ряда записей (frasunek, mitręga и др.) — не блокер для мержа
