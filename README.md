# Jesse

Jesse is a capybara friend on your phone, built for the YC Consumer Mobile Hackathon with Expo SDK 58 and Convex. It has three tabs:

- **Talk:** press to talk with Jesse, who knows today's context (who you saw, where, how it felt) and matches your mood. Passive capture runs in the background in 10-minute segments, silence is skipped on the device, and no audio or transcripts are stored, only the extracted notes.
- **Insights:** "How was your day?" shows a day score and mood, People and Activity sections, and an evidence sheet behind every fact. "Who are you?" shows your identity, what lifts you, interests, goals, personality and your orbit.
- **Contacts:** a synced-looking contact list sorted by recent, time together, deepest, encounters or vibe, with rich profiles and the full conversation history (place, time and length). Location tags every conversation.

Everything runs on Convex: extraction, the days, traits and lifts compute, nightly crons, an LLM writer that only puts computed numbers into words, and convex-test suites. Capy built it with a crew of agent threads (PRs #4 to #55), Revyl handles cloud builds and device checks, and Keiki brings Jesse to iMessage. The build log is in [hackathon.md](hackathon.md).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
