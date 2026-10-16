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
  // Companies are ticked only under Performance updates: all but the excluded ones
  const perf = !!choices.lists?.includes('performances')
  for (const i of inputs(root, 'major')) i.checked = perf && !choices.excluded?.includes(i.value)
  // Untrusted change: the component remembers this as the choice, without ticking
  // Performance updates
  root.querySelector('[data-choices]')?.dispatchEvent(new Event('change', { bubbles: true }))
}
