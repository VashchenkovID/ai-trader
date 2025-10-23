import React from 'react';
import NeuralNetworkManager from '../components/NeuralNetworkManager';

interface NeuralNetworksProps {
  className?: string;
}

const NeuralNetworks: React.FC<NeuralNetworksProps> = ({ className = '' }) => {
  return (
    <div className={`neural-networks-page ${className}`}>
      <NeuralNetworkManager />
    </div>
  );
};

export default NeuralNetworks;
