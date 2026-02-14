
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, ResumeInput } from "../types";

export const analyzeResume = async (input: ResumeInput): Promise<AnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const resumePart = input.resumeFile 
    ? {
        inlineData: {
          data: input.resumeFile.data,
          mimeType: input.resumeFile.mimeType,
        },
      }
    : { text: `RESUME TEXT:\n${input.resumeText}` };

  const promptPart = {
    text: `
      You are an expert Senior Technical Recruiter and ATS (Applicant Tracking System) Optimization specialist.
      
      TASK:
      Analyze the provided resume against the specific job description below.
      
      JOB DESCRIPTION:
      ${input.jobDescription}
      
      OBJECTIVES:
      1. MATCH SCORE: Calculate a percentage (0-100) based on how well the candidate's experience, skills, and education align with the JD requirements.
      2. MATCH REASONING: Provide a 2-3 sentence executive summary of the alignment.
      3. DEFICIT MAPPING: Identify missing hard skills, certifications, or experience levels that are critical for this role. Rank them by High/Medium/Low importance.
      4. KEYWORD OPTIMIZATION: Generate 4-6 high-impact resume bullet points that use strong action verbs and quantify achievements while incorporating keywords from the JD.
      5. GROWTH AREAS: Suggest specific sections or certifications to add to the resume.
      6. COVER LETTER: Write a highly personalized, compelling 3-paragraph cover letter that bridges the gap between the candidate's current experience and the job's needs.

      CRITICAL: Return ONLY valid JSON matching the schema.
    `
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: { parts: [resumePart, promptPart] },
    config: {
      thinkingConfig: { thinkingBudget: 4000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          matchScore: { type: Type.NUMBER },
          matchReasoning: { type: Type.STRING },
          missingSkills: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                skill: { type: Type.STRING },
                importance: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
              },
              required: ["skill", "importance"]
            }
          },
          optimizedBullets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                optimized: { type: Type.STRING },
                explanation: { type: Type.STRING }
              },
              required: ["original", "optimized", "explanation"]
                        }
          },
          suggestedAdditions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          coverLetter: { type: Type.STRING }
        },
        required: [
          "matchScore", 
          "matchReasoning", 
          "missingSkills", 
          "optimizedBullets", 
          "suggestedAdditions", 
          "coverLetter"
        ]
      }
    }
  });

  if (!response.text) {
    throw new Error("The AI failed to generate a response. Please try again.");
  }

  return JSON.parse(response.text.trim()) as AnalysisResult;
};
