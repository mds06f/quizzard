# Quizzard 🧙‍♂️ — System Architecture

## High-Level Architecture

```text
                         ┌──────────────────────────┐
                         │        User Browser       │
                         │  Chrome / Firefox / Edge  │
                         └────────────┬─────────────┘
                                      │
                                      │ HTTP Request
                                      ▼

┌────────────────────────────────────────────────────────────────┐
│                     Express.js Application                    │
│                         (server.js)                           │
│                                                                │
│  ┌─────────────────┐        ┌─────────────────────────────┐  │
│  │ EJS View Layer  │        │        API Layer             │  │
│  │ (/views)        │        │        (/routes)             │  │
│  │                 │        │                             │  │
│  │ welcome.ejs     │        │ quizRoutes.js               │  │
│  │ index.ejs       │        │                             │  │
│  │ result.ejs      │        │ GET  sections                │  │
│  └────────┬────────┘        │ GET  questions               │  │
│           │                 │ POST submit                 │  │
│           │                 │ POST save-result             │  │
│           │                 │ POST generate-ai             │  │
│           │                 └──────────────┬──────────────┘  │
│           │                                │                 │
│           ▼                                ▼                 │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                  Application Services                 │   │
│  │                                                       │   │
│  │  Quiz Service        AI Generator Service             │   │
│  │  Score Service       Database Service                 │   │
│  └───────────────┬───────────────────────┬───────────────┘   │
│                  │                       │                   │
└──────────────────┼───────────────────────┼───────────────────┘
                   │                       │

                   ▼                       ▼

        ┌─────────────────┐       ┌─────────────────────┐
        │ JSON Database   │       │ Google Gemini API   │
        │                 │       │                     │
        │ db.js           │       │ @google/genai       │
        │ db.json         │       │ gemini-2.5-flash    │
        └─────────────────┘       └─────────────────────┘


                   ▲
                   │
                   │

        ┌─────────────────────┐
        │ GitHub Actions CI   │
        │                     │
        │ Jest Tests          │
        │ Supertest           │
        │ Build Verification  │
        └─────────────────────┘

```

## Architecture Layers

Quizzard follows a layered architecture pattern that separates the application into distinct responsibilities:

```text
                 ┌───────────────────────┐
                 │     Presentation      │
                 │       Layer           │
                 │       (EJS Views)      │
                 └───────────┬───────────┘
                             │
                             ▼
                 ┌───────────────────────┐
                 │     Application       │
                 │       Layer           │
                 │   (Express Routes)    │
                 └───────────┬───────────┘
                             │
                             ▼
                 ┌───────────────────────┐
                 │     Service Layer     │
                 │  Business Logic       │
                 └───────────┬───────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
 ┌─────────────────────┐       ┌─────────────────────┐
 │   Database Layer    │       │     AI Layer        │
 │     db.js           │       │   Gemini API        │
 │     db.json         │       │   @google/genai     │
 └─────────────────────┘       └─────────────────────┘
```

## Layer Interflow

```text
                User

                 |
                 ▼

          EJS Presentation Layer

                 |
                 ▼

          Express Application Layer

                 |
                 ▼

             Service Layer

        ┌────────┴────────┐
        ▼                 ▼

 Database Layer      AI Layer

   db.json        Gemini API
```

## Deployment Architecture

Using Render:
```text
                 GitHub Repository

                         |
                         ▼

                GitHub Actions CI

                         |
                         ▼

                   Render Cloud

                         |
                         ▼

                Node.js Express App

                         |
                         ▼

                Environment Variables

                         |
                         |
                 GEMINI_API_KEY
```

## Final System Overview

```text
                         QUIZZARD

                            |
                            ▼

                         User

                            |
                            ▼

                     EJS Frontend

                            |
                            ▼

                    Express Server

                            |
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼

     Quiz Service      AI Service       Score Service

          │                 │                 │

          ▼                 ▼                 ▼

       db.json        Gemini API        Results


                            +

                    GitHub Actions

                            |

                    Automated Testing

```
