import type { RavelSnapshot } from "../shared/types";

const HOUR = 60 * 60 * 1000;
const now = Date.now();

/** Shown only on a fresh install before real activity has accumulated. */
export const MOCK_SNAPSHOT: RavelSnapshot = {
  now: {
    id: "mock-now",
    label: "AI Agents",
    keywords: ["agents", "llm", "autonomous", "orchestration"],
    eventIds: Array.from({ length: 18 }, (_, i) => `mock-now-${i}`),
    sites: [
      { id: "mock-now-0", title: "Building Autonomous AI Agents", domain: "youtube.com" },
      { id: "mock-now-1", title: "langchain-ai/langgraph", domain: "github.com" },
      { id: "mock-now-2", title: "Multi-agent orchestration patterns", domain: "docs.langchain.com" },
      { id: "mock-now-3", title: "ReAct: Synergizing Reasoning and Acting", domain: "arxiv.org" },
      { id: "mock-now-4", title: "\"How do you eval agent reliability?\"", domain: "reddit.com" },
    ],
    firstSeen: now - 3 * HOUR,
    lastSeen: now - 4 * 60 * 1000,
    totalDuration: 84 * 60 * 1000,
    score: 1,
  },
  relatedTopics: [
    { id: "m1", label: "Vector Search", keywords: [], eventIds: [], sites: [], firstSeen: now, lastSeen: now, totalDuration: 0, score: 0 },
    { id: "m2", label: "Local Models", keywords: [], eventIds: [], sites: [], firstSeen: now, lastSeen: now, totalDuration: 0, score: 0 },
    { id: "m3", label: "Tool Use", keywords: [], eventIds: [], sites: [], firstSeen: now, lastSeen: now, totalDuration: 0, score: 0 },
    { id: "m4", label: "Eval Harnesses", keywords: [], eventIds: [], sites: [], firstSeen: now, lastSeen: now, totalDuration: 0, score: 0 },
    { id: "m5", label: "Prompt Engineering", keywords: [], eventIds: [], sites: [], firstSeen: now, lastSeen: now, totalDuration: 0, score: 0 },
    { id: "m6", label: "Context Windows", keywords: [], eventIds: [], sites: [], firstSeen: now, lastSeen: now, totalDuration: 0, score: 0 },
  ],
  rabbitHoles: [
    {
      id: "rh1",
      label: "Autonomous AI",
      startTime: now - 5 * HOUR,
      endTime: now - 5 * HOUR + 42 * 60 * 1000,
      duration: 42 * 60 * 1000,
      eventIds: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"],
      trail: [
        { id: "e1", title: "Building Autonomous AI Agents", domain: "youtube.com" },
        { id: "e2", title: "langchain-ai/langgraph", domain: "github.com" },
        { id: "e3", title: "Multi-agent orchestration patterns", domain: "docs.langchain.com" },
        { id: "e4", title: "\"Anyone using agent swarms in prod?\"", domain: "reddit.com" },
        { id: "e5", title: "ReAct: Synergizing Reasoning and Acting", domain: "arxiv.org" },
        { id: "e6", title: "Agent memory architectures explained", domain: "youtube.com" },
        { id: "e7", title: "openai/swarm", domain: "github.com" },
        { id: "e8", title: "State machines for agent control flow", domain: "youtube.com" },
      ],
    },
  ],
  generatedAt: now,
};
