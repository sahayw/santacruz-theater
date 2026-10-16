// Browser helpers for the SubscribeChoices component, used by /subscribe and
// /subscribe/manage.

export interface FormChoices {
  lists: string[]
  excluded: string[] // majors left out of Performance updates
}

const inputs = (root: ParentNode, name: string) =>
  [...root.querySelectorAll<HTMLInputElement>(`[data-choices] input[name="${name}"]`)]

export function readFormChoices(root: ParentNode = document): FormChoices {
  const lists = inputs(root, 'list').filter((i) => i.checked).map((i) => i.value)
  const excluded = lists.includes('performances')
    ? inputs(root, 'major').filter((i) => !i.checked).map((i) => i.value)
    : []
  return { lists, excluded }
}

export function setFormChoices(choices: Partial<FormChoices>, root: ParentNode = document) {
  for (const i of inputs(root, 'list')) i.checked = !!choices.lists?.includes(i.value)
  for (const i of inputs(root, 'major')) i.checked = !choices.excluded?.includes(i.value)
  // Untrusted change: refreshes the component without ticking Performance updates
  root.querySelector('[data-choices]')?.dispatchEvent(new Event('change', { bubbles: true }))
}
