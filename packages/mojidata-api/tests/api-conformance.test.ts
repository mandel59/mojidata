import { createNodeApp } from '../node'
import { runMojidataApiConformanceTests } from './api-conformance'

runMojidataApiConformanceTests('default Node API conformance', () => createNodeApp())
