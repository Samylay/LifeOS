# LLM-Powered Calendar Manager

**Status:** Planning
**Started:** 
**Target:** 

## Overview

A responsive, real-time calendar application integrated with an LLM agent that manages schedules through natural language commands. Optimized for personal wellbeing with deep personalization (color theory, glycemic peaks, energy times, sleep, mental health).

## Core Features

1. **Event Creation/Modification** - Parse natural language into structured calendar data
2. **Conflict Resolution** - Check for conflicts and propose alternatives
3. **Availability Search** - Find free time slots
4. **Summary/Analysis** - Summarize day/week schedule
5. **Proactive Planning** - Generate structured plans for user confirmation
6. **Voice Commands** - API for voice input
7. **Journaling** - Voice note capture with agent actions (e.g., "remind me in 2 weeks")
8. **Risk Flagging** - Flag risky endeavors, visible in dashboard
9. **Wellbeing Dashboard** - Track and display health metrics

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Tailwind CSS |
| LLM | Gemini 2.5 Flash (Function Calling) |
| Backend | Python (FastAPI) or Node.js |
| Database | Firebase Firestore |
| Voice | Web Speech API |

## Implementation Phases

### Phase 1: Foundation
- [ ] Setup Firebase & Auth
- [ ] Define Data Schemas
- [ ] Design Calendar UI
- [ ] Implement CRUD Operations
- [ ] Real-time Sync

### Phase 2: External Calendar
- [ ] ICS/Webcal Subscription
- [ ] Client-side ICS parsing
- [ ] Read-only event integration

### Phase 3: LLM Integration
- [ ] Define Tool Schema
- [ ] Implement Gemini API call
- [ ] Action execution (createEvent, listEvents, etc.)
- [ ] Plan Preview generation

### Phase 4: UX & Polish
- [ ] Chat Interface
- [ ] Voice Input
- [ ] Preview Modal
- [ ] Responsive Design
- [ ] Error Handling

## Next Steps
- [ ] Validate idea on Reddit
- [ ] Produce working POC
- [ ] Lock down demo version

## References
- https://github.com/reclaim-ai/reclaim-raycast-extension
- https://gemini.google.com/app/891a3e37a090336c
