import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { requestVoiceToJsonModel } from "../integrations/ml/modelService.client.js";

export const NUMBER_WORDS = {
  // English
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
  lakh: 100000,
  lac: 100000,
  crore: 10000000,

  // Hindi / Hinglish transliterations
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  cheh: 6,
  chhe: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  gyarah: 11,
  barah: 12,
  terah: 13,
  chaudah: 14,
  pandrah: 15,
  solah: 16,
  satrah: 17,
  atharah: 18,
  unnis: 19,
  bees: 20,
  tees: 30,
  chalis: 40,
  chaalis: 40,
  pachas: 50,
  saath_hindi: 60, // avoid collide with saat
  sattar: 70,
  assi: 80,
  nabbe: 90,
  sau: 100,
  hazaar: 1000,
  hazar: 1000,
};

export function wordsToNumber(phrase) {
  if (!phrase || typeof phrase !== "string") return null;
  const tokens = phrase.toLowerCase().match(/[a-zA-Z]+|\d[\d,]*/g) || [];
  let total = 0;
  let current = 0;
  let sawNumber = false;

  for (const token of tokens) {
    if (/^\d/.test(token)) {
      const value = parseInt(token.replace(/,/g, ""), 10);
      if (!Number.isNaN(value)) {
        current += value;
        sawNumber = true;
      }
    } else if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, token)) {
      const value = NUMBER_WORDS[token];
      sawNumber = true;
      if (value === 100) {
        current = Math.max(current, 1) * 100;
      } else if (value === 1000) {
        total += Math.max(current, 1) * 1000;
        current = 0;
      } else if (value === 100000) {
        total += Math.max(current, 1) * 100000;
        current = 0;
      } else if (value === 10000000) {
        total += Math.max(current, 1) * 10000000;
        current = 0;
      } else {
        current += value;
      }
    }
  }

  return sawNumber ? total + current : null;
}

export function extractAmountRupees(text) {
  if (!text || typeof text !== "string") return null;

  const normalized = text
    .toLowerCase()
    .replace(/₹/g, " rupees ")
    .replace(/rs\.?/gi, " rupees ");

  // 1. Currency phrase pattern e.g. "10000 rupees", "das hazaar rupaye", "₹ 5,000"
  const currencyPattern =
    /((?:(?:\d[\d,]*(?:\.\d+)?)|[a-zA-Z]+)(?:[\s-]+(?:(?:\d[\d,]*(?:\.\d+)?)|[a-zA-Z]+)){0,4})\s*(?:rupees?|rs\b|inr|rupaye|rupya|rupaiye|रुपये|रुपया)/i;
  const match = normalized.match(currencyPattern);
  if (match) {
    const tokens = match[1].toLowerCase().match(/[a-zA-Z]+|\d[\d,]*/g) || [];
    const numTokens = [];
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      if (/^\d/.test(token) || Object.prototype.hasOwnProperty.call(NUMBER_WORDS, token)) {
        numTokens.unshift(token);
      } else {
        break;
      }
    }
    if (numTokens.length > 0) {
      const val = wordsToNumber(numTokens.join(" "));
      if (val !== null && val > 0) return Math.round(val);
    }
  }

  // 2. Explicit currency prefix e.g. "rupees 10000", "₹10,000"
  const prefixMatch = text.match(/(?:₹|rs\.?\s*|inr\s*)(\d[\d,]*(?:\.\d+)?)/i);
  if (prefixMatch) {
    const parsed = parseFloat(prefixMatch[1].replace(/,/g, ""));
    if (!Number.isNaN(parsed) && parsed > 0) return Math.round(parsed);
  }

  // 3. Fallback: keywords like "chahiye", "need", "collect" with number
  const contextMatch = text.match(
    /(?:need|want|collect|chahiye|require|target)\s*(?:of\s*)?(\d[\d,]*)/i,
  );
  if (contextMatch) {
    const parsed = parseInt(contextMatch[1].replace(/,/g, ""), 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  const reverseContextMatch = text.match(/(\d[\d,]*)\s*(?:chahiye|needed|rupees)/i);
  if (reverseContextMatch) {
    const parsed = parseInt(reverseContextMatch[1].replace(/,/g, ""), 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  // 4. Any numbers in the string if small
  const allNums = text.match(/\b\d[\d,]*\b/g);
  if (allNums && allNums.length > 0) {
    // If multiple numbers, the larger one is usually the amount (e.g., 5000 in 5 days)
    const parsedNums = allNums.map((n) => parseInt(n.replace(/,/g, ""), 10)).filter((n) => n >= 50);
    if (parsedNums.length > 0) return Math.max(...parsedNums);
  }

  return null;
}

export function extractDeadlineDays(text) {
  if (!text || typeof text !== "string") return null;
  const lower = text.toLowerCase();

  // Special phrases: "ek hafta" / "one week" / "1 week" -> 7 days
  if (/(?:ek|one|1)\s*(?:hafta|hafte|week)\b/i.test(lower)) return 7;
  if (/(?:do|two|2)\s*(?:hafte|weeks)\b/i.test(lower)) return 14;
  if (/(?:a\s*week|next\s*week|is\s*hafte)\b/i.test(lower)) return 7;
  if (/(?:kal|tomorrow)\b/i.test(lower)) return 1;

  // Numeric deadline patterns: "in 5 days", "within 3 days", "5 din mein", "5 din ke andar"
  const patterns = [
    /(?:in|within|after|mein|me|andar|ke andar|within next)\s+(\d[\d,]*)\s*(?:days?|day|din|dino|दिन)/i,
    /(\d[\d,]*)\s*(?:days?|day|din|dino|दिन)\s*(?:mein|me|andar|ke andar|within)?/i,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      const days = parseInt(match[1].replace(/,/g, ""), 10);
      if (!Number.isNaN(days) && days > 0) return days;
    }
  }

  // Word-based deadline: "in five days", "teen din mein"
  const wordPatterns = [
    /\b([a-zA-Z]+(?:[\s-]+[a-zA-Z]+){0,2})\s+(?:days?|day|din|dino)\b/i,
    /\b(?:in|within|mein|me)\s+([a-zA-Z]+)\s+(?:days?|day|din|dino)\b/i,
  ];

  for (const pattern of wordPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const val = wordsToNumber(match[1]);
      if (val !== null && val > 0 && val <= 365) return val;
    }
  }

  return null;
}

export async function interpretVoiceInput({
  transcript,
  audioBase64,
  audioMimeType,
  language,
} = {}) {
  // If external ML service URL is configured, call it via the ML client
  if (env.ML_VOICE_SERVICE_URL) {
    return requestVoiceToJsonModel({
      transcript,
      audioBase64,
      audioMimeType,
      language,
    });
  }

  // If only audio is supplied without an external Whisper model endpoint:
  if (!transcript && audioBase64) {
    throw new AppError(
      422,
      "AUDIO_TRANSCRIPTION_UNAVAILABLE",
      "Audio transcription requires ML_VOICE_SERVICE_URL or an accompanying text transcript",
    );
  }

  if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
    throw new AppError(400, "MISSING_VOICE_INPUT", "A transcript or audio recording must be provided");
  }

  const cleanTranscript = transcript.trim();
  const targetRupees = extractAmountRupees(cleanTranscript);
  const deadlineDays = extractDeadlineDays(cleanTranscript);

  if (targetRupees === null && deadlineDays === null) {
    throw new AppError(
      422,
      "VOICE_EXTRACTION_FAILED",
      "Could not confidently extract target amount or deadline from voice transcript. Please specify manually.",
    );
  }

  const finalDeadlineDays = deadlineDays ?? 7; // default to 7 days if only amount specified
  const finalTargetRupees = targetRupees ?? 0;
  const targetPaise = Math.round(finalTargetRupees * 100);

  return {
    transcript: cleanTranscript,
    targetRupees: finalTargetRupees,
    targetPaise,
    deadlineDays: finalDeadlineDays,
    extractedEntities: {
      amountRupees: finalTargetRupees,
      deadlineDays: finalDeadlineDays,
      currency: "INR",
    },
    confidence: targetRupees !== null && deadlineDays !== null ? 0.95 : 0.75,
    isDemoModel: true,
  };
}
