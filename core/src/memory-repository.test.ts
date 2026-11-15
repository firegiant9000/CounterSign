import { describeRepositoryContract } from '../testing/repository-contract';
import { createMemoryRepository } from './memory-repository';

describeRepositoryContract('memory', () =>
  Promise.resolve(createMemoryRepository()),
);
