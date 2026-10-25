import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

describe("Collection Plans & Voice API Endpoints", () => {
  it("exposes collection plans routes in OpenAPI documentation", async () => {
    const response = await request(app).get("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body.paths["/api/v1/collection-plans/interpret-voice"].post).toBeTruthy();
    expect(response.body.paths["/api/v1/collection-plans/preview"].post).toBeTruthy();
    expect(response.body.paths["/api/v1/collection-plans"].get).toBeTruthy();
    expect(response.body.paths["/api/v1/collection-plans"].post).toBeTruthy();
    expect(response.body.paths["/api/v1/collection-plans/{planId}/approve"].post).toBeTruthy();
    expect(response.body.paths["/api/v1/collection-plans/{planId}/reject"].post).toBeTruthy();
    expect(response.body.paths["/api/v1/collection-plans/{planId}/cancel"].post).toBeTruthy();
    expect(response.body.paths["/api/v1/collection-plans/{planId}/execute"].post).toBeTruthy();
  });

  it("protects collection plan routes with JWT authentication", async () => {
    const unauthVoice = await request(app)
      .post("/api/v1/collection-plans/interpret-voice")
      .send({ transcript: "Need 5000 in 3 days" });
    expect(unauthVoice.status).toBe(401);
    expect(unauthVoice.body.error.code).toBe("UNAUTHENTICATED");

    const unauthPreview = await request(app)
      .post("/api/v1/collection-plans/preview")
      .send({ targetRupees: 5000, deadlineDays: 7 });
    expect(unauthPreview.status).toBe(401);
    expect(unauthPreview.body.error.code).toBe("UNAUTHENTICATED");

    const unauthList = await request(app).get("/api/v1/collection-plans");
    expect(unauthList.status).toBe(401);
    expect(unauthList.body.error.code).toBe("UNAUTHENTICATED");

    const unauthExecute = await request(app)
      .post("/api/v1/collection-plans/00000000-0000-4000-8000-000000000001/execute");
    expect(unauthExecute.status).toBe(401);
    expect(unauthExecute.body.error.code).toBe("UNAUTHENTICATED");
  });
});
