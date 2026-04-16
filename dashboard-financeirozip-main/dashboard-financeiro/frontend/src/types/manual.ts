export interface ManualArtigo {
  id: number;
  secao_id: number;
  slug: string;
  titulo: string;
  resumo?: string | null;
  conteudo_md: string;
  ordem: number;
  ativo: boolean;
  updated_at?: string;
}

export interface ManualSecao {
  id: number;
  slug: string;
  titulo: string;
  icone?: string | null;
  ordem: number;
  ativo: boolean;
  apenas_admin: boolean;
  artigos: ManualArtigo[];
}

export interface ManualArvore {
  secoes: ManualSecao[];
}
