import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { getDatabaseConfig } from '../config/database-config.js'

const options = getDatabaseConfig()

export default new DataSource(options)
