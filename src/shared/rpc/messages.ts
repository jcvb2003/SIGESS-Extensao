import { z } from "zod";

// ============ Base Response ============
export const BaseResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export type BaseResponse = z.infer<typeof BaseResponseSchema>;

// ============ License Messages ============
export const CheckLicenseRequestSchema = z.object({
  action: z.literal("checkLicense"),
});

export const CheckLicenseResponseSchema = BaseResponseSchema.merge(
  z.object({
    ok: z.boolean().optional(),
    plan: z.string().optional(),
    reason: z.string().optional(),
    usage_manual: z.number().optional(),
    max_manual: z.number().optional(),
    usage_turbo: z.number().optional(),
    max_turbo: z.number().optional(),
  })
);

export type CheckLicenseRequest = z.infer<typeof CheckLicenseRequestSchema>;
export type CheckLicenseResponse = z.infer<typeof CheckLicenseResponseSchema>;

// ============ Settings Messages ============
export const UpdateESocialSettingsRequestSchema = z.object({
  action: z.literal("updateESocialSettings"),
  settings: z.any(),
});

export const UpdateESocialSettingsResponseSchema = BaseResponseSchema.merge(
  z.object({
    settings: z.any().optional(),
  })
);

export type UpdateESocialSettingsRequest = z.infer<typeof UpdateESocialSettingsRequestSchema>;
export type UpdateESocialSettingsResponse = z.infer<typeof UpdateESocialSettingsResponseSchema>;

// ============ Status Messages ============
export const UpdateGovBatchStatusRequestSchema = z.object({
  action: z.literal("updateGovBatchStatus"),
  status: z.string(),
  statusTitle: z.string(),
  statusDescription: z.string(),
  loginConcluido: z.boolean().optional(),
  progressStep: z.number().optional(),
  progressTotal: z.number().optional(),
  lastError: z.string().optional(),
});

export const UpdateGovBatchStatusResponseSchema = BaseResponseSchema;

export type UpdateGovBatchStatusRequest = z.infer<typeof UpdateGovBatchStatusRequestSchema>;
export type UpdateGovBatchStatusResponse = z.infer<typeof UpdateGovBatchStatusResponseSchema>;

// ============ Batch Login Messages ============
export const StartBatchLoginRequestSchema = z.object({
  action: z.literal("startBatchLogin"),
  type: z.enum(["pesqbrasil_agro", "pesqbrasil_mpa", "esocial", "inss"]),
  credentials: z.array(
    z.object({
      cpf: z.string(),
      senha: z.string(),
      nome: z.string().optional(),
      valorComercializado: z.string().optional(),
    })
  ),
});

export const StartBatchLoginResponseSchema = BaseResponseSchema.merge(
  z.object({
    count: z.number().optional(),
    failed: z.number().optional(),
  })
);

export type StartBatchLoginRequest = z.infer<typeof StartBatchLoginRequestSchema>;
export type StartBatchLoginResponse = z.infer<typeof StartBatchLoginResponseSchema>;

// ============ Container Messages ============
export const AbrirAbaContainerRequestSchema = z.object({
  action: z.literal("abrirAbaContainer"),
  url: z.string().url(),
  cpf: z.string(),
  senha: z.string(),
  nome: z.string().optional(),
  auditoriaData: z.any().optional(),
  valorComercializado: z.string().optional(),
});

export const AbrirAbaContainerResponseSchema = BaseResponseSchema.merge(
  z.object({
    queued: z.boolean().optional(),
  })
);

export type AbrirAbaContainerRequest = z.infer<typeof AbrirAbaContainerRequestSchema>;
export type AbrirAbaContainerResponse = z.infer<typeof AbrirAbaContainerResponseSchema>;

// ============ Union Types ============
export type MessageRequest =
  | CheckLicenseRequest
  | UpdateESocialSettingsRequest
  | UpdateGovBatchStatusRequest
  | StartBatchLoginRequest
  | AbrirAbaContainerRequest;

export type MessageResponse =
  | CheckLicenseResponse
  | UpdateESocialSettingsResponse
  | UpdateGovBatchStatusResponse
  | StartBatchLoginResponse
  | AbrirAbaContainerResponse
  | BaseResponse;

// ============ Message Validators ============
export function validateRequest(data: unknown): MessageRequest {
  const schemas = [
    CheckLicenseRequestSchema,
    UpdateESocialSettingsRequestSchema,
    UpdateGovBatchStatusRequestSchema,
    StartBatchLoginRequestSchema,
    AbrirAbaContainerRequestSchema,
  ];

  for (const schema of schemas) {
    try {
      return schema.parse(data);
    } catch {
      continue;
    }
  }

  throw new Error(`Invalid message: ${JSON.stringify(data)}`);
}
