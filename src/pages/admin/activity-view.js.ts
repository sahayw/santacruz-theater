/// <reference types="vite/client" />
import type { APIRoute } from 'astro'
import source from '../../lib/activity-view.ts?raw'
import { browserModuleResponse } from '../../lib/browser-module.ts'

export const GET: APIRoute = () => browserModuleResponse(source)
