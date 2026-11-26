// DATUM Gateway displays each statistic as a label and its adjacent value.
// Limit each match to that cell so a missing value cannot borrow the next statistic.
function cell(html, label) {
  const pattern = new RegExp(
    String.raw`<t[hd]\b[^>]*>\s*${label}:?\s*</t[hd]>\s*(?:</tr>\s*<tr\b[^>]*>\s*)?<td\b[^>]*>([^<]*)</td>`,
    'i',
  )
  return (
    pattern
      .exec(html)?.[1]
      .replace(/&nbsp;/gi, ' ')
      .trim() ?? ''
  )
}

function count(value) {
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

export function dashboardStats(html, unitToPh) {
  const connections =
    count(cell(html, 'Total Work Subscriptions')) ??
    count(cell(html, 'Total Connections'))
  const rate = /^(\d+(?:\.\d+)?)\s*([gtpe]h)\/(?:s|sec)$/i.exec(
    cell(html, 'Estimated Hashrate'),
  )
  const ph = rate
    ? Number(rate[1]) * unitToPh[rate[2].toLowerCase() + '/s']
    : NaN
  const hashrate_ph = Number.isFinite(ph) ? ph : null
  if (connections === null && hashrate_ph === null)
    throw new Error('DATUM dashboard stats not found')
  return { connections, hashrate_ph }
}
