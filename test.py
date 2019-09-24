import game_old
import network
import numpy as np
from random import randint, random
'''
score_for_this_g = []
weight_for_this_g = []
biases_for_this_g = []
for i in range(0,1):
        g = game_old.game()
        w,b,score = g.start()
        score_for_this_g.append(score)
        weight_for_this_g.append(w)
        biases_for_this_g.append(b)
        #w,b,score = g.start()
        print(weight_for_this_g)
'''


def breed(data, retain=0.17, random_select=0.05, mutation_rate=0.01):
        retain_len = int(len(data)*retain)
        survivals = data[:retain_len]

        # randomly add other individuals to promote genetic diversity
        for individual in data[retain_len:]:
                if random_select > random():
                        survivals.append(individual)
        
        # mutate some of the survivals
        for individual in survivals:
                if mutation_rate > random():
                        element_to_mutate = randint(0,1)
                        layout_of_that_element = randint(0,len(individual[element_to_mutate])-1)
                        layout_to_node = randint(0, len(individual[element_to_mutate][layout_of_that_element])-1)
                        node_to_mutate = randint(0, len(individual[element_to_mutate][layout_of_that_element][layout_to_node])-1)
                        individual[element_to_mutate][layout_of_that_element][layout_to_node][node_to_mutate] = \
                                data[randint(0,len(data)-1)][element_to_mutate][layout_of_that_element][layout_to_node][node_to_mutate]
        # crossover
        parents_length = len(survivals)
        desired_length = len(data) - parents_length
        offsprings = []
        while len(offsprings) < desired_length:
                male_no = randint(0, parents_length-1)
                female_no = randint(0, parents_length-1)
                if male_no != female_no:
                        male_parent = survivals[male_no]
                        female_parent = survivals[female_no]
                        #offsprings.append([male_parent[0],female_parent[1]])
                        
                        half_weights = int(len(male_parent[0])/2)
                        weights_from_male_parent = male_parent[0][:half_weights]
                        weights_from_female_parent = female_parent[0][half_weights:]

                        half_biases = int(len(male_parent[1])/2)
                        biases_from_male_parent = male_parent[1][:half_biases]
                        biases_from_female_parent = female_parent[1][half_biases:]
                        
                        offsprings.append([weights_from_male_parent+weights_from_female_parent, \
                                biases_from_male_parent+biases_from_female_parent])
                        
        survivals.extend(offsprings)
        return survivals

population = 100
evolved_data_list = []
for gen in range(0,20):
        fitness = 0
        data_list = []
        print('Generation:',gen+1)
        for i in range(0,population):
                g = game_old.game()
                #g.set_evolution_move(gen*100)
                g.display_info(gen+1,i+1,fitness/(i+1))
                if not(evolved_data_list == []):
                        g.neural_network.setWeights(evolved_data_list[i][0])
                        g.neural_network.setBiases(evolved_data_list[i][1])
                w,b,score = g.start()
                fitness += score
                data_list.append([w,b,score])
        print("Fitness: ", fitness/population)
        sorted_data_list = sorted(data_list, key=lambda d:d[2],reverse=True)
        evolved_data_list = breed(sorted_data_list)
        



        



'''nn = network.Network([2,6,7])
x = np.array([2,3])
x_new = x.reshape((2,1))
print(nn.feedforward(x_new))'''
