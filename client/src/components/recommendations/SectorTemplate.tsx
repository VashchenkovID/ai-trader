import React from 'react';
import { Tag } from 'primereact/tag';
import { translateSector } from '../../utils/sectorTranslator';

interface Recommendation {
  sector?: string;
}

interface SectorTemplateProps {
  rowData: Recommendation;
}

const SectorTemplate: React.FC<SectorTemplateProps> = ({ rowData }) => {
  if (!rowData.sector) return <span>—</span>;
  const translatedSector = translateSector(rowData.sector);
  return <Tag value={translatedSector} severity="info" />;
};

export default SectorTemplate;

