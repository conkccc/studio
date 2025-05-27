
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// This configuration might still be used if other AI features are added later.
// For now, it's not actively used by any flow since cost-analysis is removed.
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.0-flash',
});
