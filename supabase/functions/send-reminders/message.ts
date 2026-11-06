/** Pure notification text — shared by the Edge Function and unit tests. */
export interface ReminderPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function reminderMessage(due: number, overdue: number): ReminderPayload {
  const body =
    overdue > 0
      ? `Bugun ${due} ta takrorlash, ${overdue} tasi kechikkan`
      : `Bugun ${due} ta takrorlash sizni kutmoqda`;
  return { title: "LL — takrorlash vaqti", body, url: "/bugun", tag: "ll-reminder" };
}
