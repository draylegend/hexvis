/**
 * Arms a delayed retry whose rejection is logged instead of floating.
 *
 * @param {function(): (void | Promise<void>)} task Work to run after the delay.
 * @param {number} delayMs Delay in milliseconds.
 * @returns {void}
 */
export const scheduleRetry = (task: () => void | Promise<void>, delayMs: number): void => {
  setTimeout(() => {
    Promise.resolve(task()).catch(console.error);
  }, delayMs);
};
