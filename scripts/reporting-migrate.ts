import { migrateReportingPreferences } from '../server/reporting/preferences';
const path = process.env.REPORTING_PREFERENCES_DB;
if (!path) throw new Error('Configure private REPORTING_PREFERENCES_DB outside checkout.');
migrateReportingPreferences(path); console.log('Reporting preference schema initialized explicitly. No source orders or employee records imported.');
