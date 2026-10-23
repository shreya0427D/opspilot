// Points the server code at the emulators with harmless test configuration.
process.env.NEXT_PUBLIC_USE_EMULATORS = "true";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-opspilot";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "demo-opspilot.appspot.com";
process.env.GEMINI_API_KEY = "test-key-not-used-because-ai-is-mocked";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
delete process.env.TASKS_QUEUE;
delete process.env.RESEND_API_KEY;
