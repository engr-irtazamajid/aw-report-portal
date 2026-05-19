import { z } from 'zod';

const ssnLast4 = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'Must be 4 digits');
const last4Optional = z
  .union([z.literal(''), z.string().regex(/^\d{4}$/, 'Must be 4 digits')])
  .optional();

const optionalNonEmpty = z
  .union([z.literal(''), z.string().min(1)])
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const accountSchema = z.object({
  owner: z.enum(['primary', 'spouse', 'joint']),
  category: z.enum(['retirement', 'non_retirement']),
  account_type: z.enum(['ira', 'roth_ira', 'k401', 'pension', 'brokerage', 'joint', 'other']),
  institution: z.string().max(120).optional().default(''),
  last_four: last4Optional,
  label: optionalNonEmpty,
  id: z.number().optional(),
});

const liabilitySchema = z.object({
  liability_type: z.enum([
    'mortgage',
    'auto_loan',
    'student_loan',
    'credit_card',
    'heloc',
    'other',
  ]),
  label: z.string().min(1, 'Required').max(120),
  interest_rate: z.coerce.number().min(0).max(99).optional().nullable(),
  last_four: last4Optional,
  id: z.number().optional(),
});

const trustSchema = z.object({
  label: z.string().min(1, 'Required').max(120),
  address: z.string().min(1, 'Required').max(255),
  notes: optionalNonEmpty,
  id: z.number().optional(),
});

const deductibleSchema = z.object({
  label: z.string().min(1, 'Required').max(120),
  amount: z.coerce.number().min(0, 'Must be ≥ 0'),
  id: z.number().optional(),
});

export const clientSchema = z
  .object({
    primary_first_name: z.string().min(1, 'Required').max(80),
    primary_last_name: z.string().min(1, 'Required').max(80),
    primary_dob: z.string().min(1, 'Required'),
    primary_ssn_last4: ssnLast4,

    has_spouse: z.boolean(),
    spouse_first_name: optionalNonEmpty,
    spouse_last_name: optionalNonEmpty,
    spouse_dob: z.union([z.literal(''), z.string()]).optional(),
    spouse_ssn_last4: last4Optional,

    monthly_inflow: z.coerce.number().min(0, 'Must be ≥ 0'),
    monthly_outflow_budget: z.coerce.number().min(0, 'Must be ≥ 0'),
    private_reserve_target_override: z
      .union([z.literal(''), z.coerce.number().min(0)])
      .optional(),
    floor_amount: z.coerce.number().min(0).default(1000),

    accounts: z.array(accountSchema),
    liabilities: z.array(liabilitySchema),
    trust_properties: z.array(trustSchema),
    deductibles: z.array(deductibleSchema),
  })
  .superRefine((value, ctx) => {
    if (value.has_spouse) {
      const required: Array<[keyof typeof value, string]> = [
        ['spouse_first_name', 'Required'],
        ['spouse_last_name', 'Required'],
        ['spouse_dob', 'Required'],
        ['spouse_ssn_last4', 'Required'],
      ];
      for (const [path, msg] of required) {
        if (!value[path]) {
          ctx.addIssue({ code: 'custom', path: [path], message: msg });
        }
      }
    }
  });

export type ClientFormValues = z.infer<typeof clientSchema>;
