-- Remove `atua_no_operacional(uuid)`.
--
-- Foi criada em 20261113100000 (aviso de pagamento do vendedor) e deixada intacta em 20261119100100 (setor
-- Administrativo) só porque o app anterior a essa PR ainda a poderia chamar. Desde então as quatro funções que a usavam
-- (`pode_ver_comprovante_pagamento`, `devolver_aviso_pagamento`, `pagamentos_a_confirmar` e `confirmar_pagamento`)
-- passaram a usar `confirma_pagamento_cliente`, e nenhum trecho do app a chama.
--
-- Sem `cascade` de propósito: se algum objeto ainda depender dela, a migration falha em vez de apagá-lo junto.
drop function if exists public.atua_no_operacional(uuid);
