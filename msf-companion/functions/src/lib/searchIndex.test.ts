import { describe, it, expect } from "vitest";
import {
  INDEX_NAME,
  INDEX_SCHEMA,
  VECTOR_SEARCH_CONFIG,
  getIndexDefinition,
  getDataSourceDefinition,
  getIndexerDefinition,
} from "./searchIndex.js";

describe("searchIndex", () => {
  it("index schema includes all required fields", () => {
    const fieldNames = INDEX_SCHEMA.fields.map((f) => f.name);
    expect(fieldNames).toContain("id");
    expect(fieldNames).toContain("category");
    expect(fieldNames).toContain("content");
    expect(fieldNames).toContain("sourceCreatorName");
    expect(fieldNames).toContain("sourceUrl");
    expect(fieldNames).toContain("sourceDate");
    expect(fieldNames).toContain("contentVector");
  });

  it("id field is the key field", () => {
    const idField = INDEX_SCHEMA.fields.find((f) => f.name === "id");
    expect(idField?.key).toBe(true);
  });

  it("contentVector field has correct dimensions for text-embedding-3-small", () => {
    const vectorField = INDEX_SCHEMA.fields.find((f) => f.name === "contentVector");
    expect(vectorField?.type).toBe("Collection(Edm.Single)");
    expect(vectorField?.dimensions).toBe(1536);
    expect(vectorField?.vectorSearchProfile).toBe("msf-vector-profile");
  });

  it("sourceVideoTitle field is searchable", () => {
    const field = INDEX_SCHEMA.fields.find((f) => f.name === "sourceVideoTitle");
    expect(field?.searchable).toBe(true);
  });

  it("extractedAt field is included", () => {
    const field = INDEX_SCHEMA.fields.find((f) => f.name === "extractedAt");
    expect(field).toBeDefined();
    expect(field?.type).toBe("Edm.DateTimeOffset");
  });

  it("index name is msf-knowledge", () => {
    expect(INDEX_NAME).toBe("msf-knowledge");
  });

  it("vector search config uses HNSW with cosine metric", () => {
    expect(VECTOR_SEARCH_CONFIG.algorithms[0].kind).toBe("hnsw");
    expect(VECTOR_SEARCH_CONFIG.algorithms[0].parameters.metric).toBe("cosine");
  });

  it("getIndexDefinition returns complete index definition", () => {
    const def = getIndexDefinition();
    expect(def.name).toBe("msf-knowledge");
    expect(def.fields.length).toBe(INDEX_SCHEMA.fields.length);
    expect(def.vectorSearch).toBeDefined();
  });

  it("getDataSourceDefinition uses knowledge container", () => {
    const def = getDataSourceDefinition("AccountEndpoint=https://test;AccountKey=key;");
    expect(def.name).toBe("cosmos-msf-knowledge");
    expect(def.type).toBe("cosmosdb");
    expect(def.container.name).toBe("knowledge");
  });

  it("getIndexerDefinition schedules hourly refresh", () => {
    const def = getIndexerDefinition();
    expect(def.schedule.interval).toBe("PT1H");
    expect(def.targetIndexName).toBe("msf-knowledge");
    expect(def.dataSourceName).toBe("cosmos-msf-knowledge");
  });
});
