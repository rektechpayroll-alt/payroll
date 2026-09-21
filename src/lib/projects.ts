import type { Project, ProjectTimeEntry } from "./queries";

/** Track Projects — pure derived logic: hours logged translate into cost against budget, the same "budget headroom" idea the Profitability page already uses for payroll. */

export type ProjectSummary = {
  hoursLogged: number;
  costToDate: number;
  budgetRemaining: number;
  percentUsed: number;
  isOverBudget: boolean;
};

export function summarizeProject(project: Project, entries: ProjectTimeEntry[]): ProjectSummary {
  const hoursLogged = entries.reduce((sum, e) => sum + e.hours, 0);
  const costToDate = Math.round(hoursLogged * project.hourly_rate * 100) / 100;
  const budgetRemaining = Math.round((project.budget - costToDate) * 100) / 100;
  const percentUsed = project.budget > 0 ? (costToDate / project.budget) * 100 : 0;
  return {
    hoursLogged,
    costToDate,
    budgetRemaining,
    percentUsed,
    isOverBudget: costToDate > project.budget,
  };
}
