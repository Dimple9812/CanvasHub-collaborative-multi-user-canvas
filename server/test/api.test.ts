import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { signupAgent, startServer } from "./helpers.js";

let srv: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  srv = await startServer();
});
afterEach(async () => {
  await srv.close();
});

describe("auth", () => {
  it("signs up, sets an httpOnly session cookie and returns the user without secrets", async () => {
    const res = await request(srv.app).post("/api/auth/signup").send({ email: "a@example.com", password: "longenough", name: "Ada" });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "a@example.com", name: "Ada", isDemo: false });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain("ch_session=");
    expect(cookie).toContain("HttpOnly");
  });

  it("rejects duplicate emails, short passwords and bad JSON with one error shape", async () => {
    await request(srv.app).post("/api/auth/signup").send({ email: "a@example.com", password: "longenough", name: "Ada" });
    const dup = await request(srv.app).post("/api/auth/signup").send({ email: "A@example.com", password: "longenough", name: "Ada" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("EMAIL_TAKEN");

    const short = await request(srv.app).post("/api/auth/signup").send({ email: "b@example.com", password: "123", name: "B" });
    expect(short.status).toBe(400);
    expect(short.body).toEqual({ error: "VALIDATION", message: expect.stringContaining("8 characters") });

    const bad = await request(srv.app).post("/api/auth/login").set("Content-Type", "application/json").send("{oops");
    expect(bad.status).toBe(400);
  });

  it("uses the same message for unknown email and wrong password", async () => {
    await request(srv.app).post("/api/auth/signup").send({ email: "a@example.com", password: "longenough", name: "Ada" });
    const wrongPw = await request(srv.app).post("/api/auth/login").send({ email: "a@example.com", password: "wrongpassword" });
    const noUser = await request(srv.app).post("/api/auth/login").send({ email: "nobody@example.com", password: "wrongpassword" });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body);
  });

  it("demo login creates a fresh guest with a starter board", async () => {
    const agent = request.agent(srv.app);
    const res = await agent.post("/api/auth/demo");
    expect(res.status).toBe(201);
    expect(res.body.user.isDemo).toBe(true);
    const boards = await agent.get("/api/boards");
    expect(boards.body.boards).toHaveLength(1);
    expect(boards.body.boards[0]).toMatchObject({ name: "Welcome board", role: "owner", shapeCount: 8 });

    const other = await request.agent(srv.app).post("/api/auth/demo");
    expect(other.body.user.id).not.toBe(res.body.user.id);
  });

  it("protects routes and clears the session on logout", async () => {
    expect((await request(srv.app).get("/api/boards")).status).toBe(401);
    const { agent } = await signupAgent(srv.app);
    expect((await agent.get("/api/auth/me")).status).toBe(200);
    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("boards and sharing", () => {
  it("creates, renames, lists and deletes a board", async () => {
    const { agent } = await signupAgent(srv.app);
    const created = await agent.post("/api/boards").send({ name: "Sprint retro" });
    expect(created.status).toBe(201);
    const id = created.body.board.id;
    expect(created.body.board.invites.edit).toHaveLength(24);

    expect((await agent.patch(`/api/boards/${id}`).send({ name: "Retro #12" })).body.board.name).toBe("Retro #12");
    const names = (await agent.get("/api/boards")).body.boards.map((b: { name: string }) => b.name);
    expect(names).toContain("Retro #12");

    expect((await agent.delete(`/api/boards/${id}`)).status).toBe(204);
    expect((await agent.get(`/api/boards/${id}`)).status).toBe(404);
  });

  it("hides boards from non-members with a 404, not a 403", async () => {
    const owner = await signupAgent(srv.app, "Owner");
    const stranger = await signupAgent(srv.app, "Stranger");
    const id = (await owner.agent.post("/api/boards").send({ name: "Private" })).body.board.id;
    expect((await stranger.agent.get(`/api/boards/${id}`)).status).toBe(404);
    expect((await stranger.agent.delete(`/api/boards/${id}`)).status).toBe(404);
  });

  it("view links grant read-only access; edit links upgrade; old links stop working after reset", async () => {
    const owner = await signupAgent(srv.app, "Owner");
    const guest = await signupAgent(srv.app, "Guest");
    const board = (await owner.agent.post("/api/boards").send({ name: "Shared" })).body.board;

    const asViewer = await guest.agent.post(`/api/boards/${board.id}/join`).send({ invite: board.invites.view });
    expect(asViewer.body.board.role).toBe("viewer");
    expect(asViewer.body.board.invites).toEqual({});
    expect((await guest.agent.patch(`/api/boards/${board.id}`).send({ name: "hacked" })).status).toBe(403);
    expect((await guest.agent.post(`/api/boards/${board.id}/versions`).send({ name: "v1" })).status).toBe(403);

    const asEditor = await guest.agent.post(`/api/boards/${board.id}/join`).send({ invite: board.invites.edit });
    expect(asEditor.body.board.role).toBe("editor");
    expect(asEditor.body.board.invites).toEqual({ view: board.invites.view });
    // A view link never downgrades an editor.
    const again = await guest.agent.post(`/api/boards/${board.id}/join`).send({ invite: board.invites.view });
    expect(again.body.board.role).toBe("editor");
    expect((await guest.agent.delete(`/api/boards/${board.id}`)).status).toBe(403);

    const rotated = (await owner.agent.post(`/api/boards/${board.id}/invites/rotate`)).body.board;
    expect(rotated.invites.edit).not.toBe(board.invites.edit);
    const late = await signupAgent(srv.app, "Late");
    const stale = await late.agent.post(`/api/boards/${board.id}/join`).send({ invite: board.invites.edit });
    expect(stale.status).toBe(404);
    expect(stale.body.error).toBe("INVALID_INVITE");
  });

  it("saves and reads named versions", async () => {
    const { agent } = await signupAgent(srv.app);
    const board = (await agent.get("/api/boards")).body.boards[0];
    const saved = await agent.post(`/api/boards/${board.id}/versions`).send({ name: "Before redesign" });
    expect(saved.status).toBe(201);
    expect(saved.body.version.shapeCount).toBe(8);
    const list = (await agent.get(`/api/boards/${board.id}/versions`)).body.versions;
    expect(list[0]).toMatchObject({ name: "Before redesign", createdBy: "Ada" });
    const one = await agent.get(`/api/boards/${board.id}/versions/${list[0].id}`);
    expect(Buffer.from(one.body.version.state, "base64").length).toBeGreaterThan(100);
  });
});
