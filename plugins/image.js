import { executeGemini } from './gemini.js';

export default {
  name: 'image',
  aliases: ['imagine'],
  description: 'Génère une image avec Gemini à partir d’une description.',
  async execute(context) {
    await executeGemini(context, { generateImage: true });
  },
};
