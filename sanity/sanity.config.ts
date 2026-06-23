import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'sanityka',

  projectId: 'd0fzn4cs',
  dataset: 'sanityyy',

  plugins: [structureTool(), visionTool()],

  schema: {
    types: schemaTypes,
  },
})
