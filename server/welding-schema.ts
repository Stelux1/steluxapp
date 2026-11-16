// The welding preparation grew into the general hosted schema preparation (server/hosted-schema.ts):
// it now derives every table, reference, foreign key and unique index from shared/resources.ts.
export {
  prepareHostedSchema as prepareWeldingTraceability,
  verifyHostedSchema as verifyWeldingTraceability,
  prepareHostedSchema, verifyHostedSchema, inspectHostedSchema, PREPARE_COMMAND,
} from './hosted-schema.ts';
