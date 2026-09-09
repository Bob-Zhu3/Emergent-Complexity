import { surveyConfig, sampleRules, surveyRule, selectInteresting } from './lib/analysis.js';

self.onmessage = event => {
  try {
    const seed = event.data?.seed;
    if (typeof seed !== 'string' || seed.length > 100) throw new Error('Provide a sampling seed up to 100 characters.');
    const config = { ...surveyConfig, ruleSeed: seed };
    const rules = [];
    for (const sample of sampleRules(seed, config.count)) {
      rules.push(surveyRule(sample, config));
      self.postMessage({ type: 'progress', completed: rules.length });
    }
    self.postMessage({ type: 'complete', survey: { schema: 1, config, selectedRule: selectInteresting(rules).rule, rules } });
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
