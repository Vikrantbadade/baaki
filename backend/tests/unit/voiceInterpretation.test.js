import { describe, expect, it } from "vitest";
import {
  extractAmountRupees,
  extractDeadlineDays,
  interpretVoiceInput,
  wordsToNumber,
} from "../../src/services/voiceInterpretation.service.js";

describe("Voice Interpretation & NLP Entity Extraction", () => {
  describe("wordsToNumber", () => {
    it("converts english number words correctly", () => {
      expect(wordsToNumber("five")).toBe(5);
      expect(wordsToNumber("twenty five")).toBe(25);
      expect(wordsToNumber("one hundred")).toBe(100);
      expect(wordsToNumber("one thousand")).toBe(1000);
      expect(wordsToNumber("two thousand five hundred")).toBe(2500);
      expect(wordsToNumber("ten thousand")).toBe(10000);
    });

    it("converts hindi / hinglish transliterated number words", () => {
      expect(wordsToNumber("ek")).toBe(1);
      expect(wordsToNumber("do")).toBe(2);
      expect(wordsToNumber("teen")).toBe(3);
      expect(wordsToNumber("char")).toBe(4);
      expect(wordsToNumber("paanch")).toBe(5);
      expect(wordsToNumber("das")).toBe(10);
      expect(wordsToNumber("bees")).toBe(20);
      expect(wordsToNumber("das hazaar")).toBe(10000);
      expect(wordsToNumber("pachas hazar")).toBe(50000);
    });

    it("parses mixed digit and word phrases", () => {
      expect(wordsToNumber("5 thousand")).toBe(5000);
      expect(wordsToNumber("10,000")).toBe(10000);
    });
  });

  describe("extractAmountRupees", () => {
    it("extracts amount from English sentences", () => {
      expect(extractAmountRupees("I need 10000 rupees in 5 days")).toBe(10000);
      expect(extractAmountRupees("Collect ₹ 4,500 within one week")).toBe(4500);
      expect(extractAmountRupees("target of rs. 25000 in 3 days")).toBe(25000);
      expect(extractAmountRupees("need five thousand rupees")).toBe(5000);
    });

    it("extracts amount from Hindi / Hinglish sentences", () => {
      expect(extractAmountRupees("Mere ko 5 din mein 1000 rupaye chahiye")).toBe(1000);
      expect(extractAmountRupees("Mujhe das hazaar rupaye chahiye do din me")).toBe(10000);
      expect(extractAmountRupees("paanch sau rupaye chahiye")).toBe(500);
      expect(extractAmountRupees("3 din me 20000 chahiye")).toBe(20000);
    });
  });

  describe("extractDeadlineDays", () => {
    it("extracts deadline from English phrases", () => {
      expect(extractDeadlineDays("in 5 days")).toBe(5);
      expect(extractDeadlineDays("within 7 days")).toBe(7);
      expect(extractDeadlineDays("collect within one week")).toBe(7);
      expect(extractDeadlineDays("within two weeks")).toBe(14);
      expect(extractDeadlineDays("tomorrow")).toBe(1);
    });

    it("extracts deadline from Hindi / Hinglish phrases", () => {
      expect(extractDeadlineDays("5 din mein")).toBe(5);
      expect(extractDeadlineDays("do din me")).toBe(2);
      expect(extractDeadlineDays("teen din ke andar")).toBe(3);
      expect(extractDeadlineDays("ek hafta me")).toBe(7);
      expect(extractDeadlineDays("Mere ko 5 din mein 1000 rupaye chahiye")).toBe(5);
    });
  });

  describe("interpretVoiceInput", () => {
    it("extracts both target and deadline from natural input", async () => {
      const result = await interpretVoiceInput({
        transcript: "Mere ko 5 din mein 10000 rupaye chahiye",
      });

      expect(result.targetRupees).toBe(10000);
      expect(result.targetPaise).toBe(1000000);
      expect(result.deadlineDays).toBe(5);
      expect(result.isDemoModel).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("defaults to 7 days if deadline is not mentioned in input", async () => {
      const result = await interpretVoiceInput({
        transcript: "Collect ₹5000",
      });

      expect(result.targetRupees).toBe(5000);
      expect(result.targetPaise).toBe(500000);
      expect(result.deadlineDays).toBe(7);
    });

    it("throws 400 when voice input is empty", async () => {
      await expect(interpretVoiceInput({ transcript: "" })).rejects.toMatchObject({
        status: 400,
        code: "MISSING_VOICE_INPUT",
      });
    });

    it("throws 422 when extraction fails completely", async () => {
      await expect(
        interpretVoiceInput({ transcript: "Hello how are you doing today" }),
      ).rejects.toMatchObject({
        status: 422,
        code: "VOICE_EXTRACTION_FAILED",
      });
    });
  });
});
