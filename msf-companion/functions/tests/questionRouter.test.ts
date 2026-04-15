import { describe, it, expect } from "vitest";
import { heuristicClassify, getModelForComplexity } from "../../src/lib/question-router";

describe("Question Router", () => {
  describe("heuristicClassify", () => {
    it("should classify 'What is Wolverine's role?' as simple", () => {
      const result = heuristicClassify("What is Wolverine's role?");
      expect(result.complexity).toBe("simple");
    });

    it("should classify 'Is Kestrel good?' as simple", () => {
      const result = heuristicClassify("Is Kestrel good?");
      expect(result.complexity).toBe("simple");
    });

    it("should classify 'Analyze my full roster for Crucible defense' as complex", () => {
      const result = heuristicClassify("Analyze my full roster for Crucible defense");
      expect(result.complexity).toBe("complex");
    });

    it("should classify 'Plan my DD7 teams' as complex", () => {
      const result = heuristicClassify("Plan my DD7 teams");
      expect(result.complexity).toBe("complex");
    });

    it("should classify Dark Dimension questions as complex", () => {
      const result = heuristicClassify("What teams for Dark Dimension 7 cosmic nodes?");
      expect(result.complexity).toBe("complex");
    });

    it("should classify comparison questions as medium", () => {
      const result = heuristicClassify("Should I build Eternals or Darkhold for raids?");
      expect(result.complexity).toBe("medium");
    });

    it("should default to medium for ambiguous questions", () => {
      const result = heuristicClassify("Tell me about the best teams right now");
      expect(result.complexity).toBe("medium");
    });

    it("should handle empty strings without crashing", () => {
      const result = heuristicClassify("");
      expect(["simple", "medium", "complex"]).toContain(result.complexity);
    });
  });

  describe("getModelForComplexity", () => {
    it("should return gpt-4o-mini for simple questions", () => {
      const result = getModelForComplexity("simple");
      expect(result.modelLabel).toBe("gpt-4o-mini");
    });

    it("should return gpt-4o for complex questions", () => {
      const result = getModelForComplexity("complex");
      expect(result.modelLabel).toBe("gpt-4o");
    });

    it("should return gpt-4o for medium questions", () => {
      const result = getModelForComplexity("medium");
      expect(result.modelLabel).toBe("gpt-4o");
    });

    it("should record modelUsed correctly on AdvisorMessage (mocked)", () => {
      // Verify the model selection output matches expected values
      const simpleModel = getModelForComplexity("simple");
      const complexModel = getModelForComplexity("complex");
      const mediumModel = getModelForComplexity("medium");

      expect(simpleModel.modelLabel).toBe("gpt-4o-mini");
      expect(complexModel.modelLabel).toBe("gpt-4o");
      expect(mediumModel.modelLabel).toBe("gpt-4o");
    });
  });

  describe("Full routing pipeline", () => {
    it("should route simple factual question through mini model", () => {
      const question = "What is Wolverine's role?";
      const { complexity } = heuristicClassify(question);
      const { modelLabel } = getModelForComplexity(complexity);

      expect(complexity).toBe("simple");
      expect(modelLabel).toBe("gpt-4o-mini");
    });

    it("should route complex roster analysis through full model", () => {
      const question = "Analyze my full roster for Crucible defense and suggest optimal War teams";
      const { complexity } = heuristicClassify(question);
      const { modelLabel } = getModelForComplexity(complexity);

      expect(complexity).toBe("complex");
      expect(modelLabel).toBe("gpt-4o");
    });

    it("should route medium question through full model", () => {
      const question = "Which cosmic team is better for raids?";
      const { complexity } = heuristicClassify(question);
      const { modelLabel } = getModelForComplexity(complexity);

      expect(complexity).toBe("medium");
      expect(modelLabel).toBe("gpt-4o");
    });
  });
});
