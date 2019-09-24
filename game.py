import pygame
import snake as Snk
import cake
import sys
import random
import network
import numpy as np

#外挂系统
class game():
    def __init__(self):
        pygame.init()
        #################
        ## Ai Settings ##
        #################
        self.neural_network = network.Network([9,18,7,3])
        self.evolution_moves = 100

        #####################
        ## Regular Settings##
        self.clock = pygame.time.Clock()   
        self.display_height = 500
        self.display_width = 500   
        self.screen = pygame.display.set_mode([self.display_height,self.display_width])     #游戏分辨率
        self.background_color = [47,47,47]                   #背景颜色
        self.thisWay = 'right'                               #初始方向
        self.HEADcolor = [176,48,96]                         #头的颜色
        self.color = [255,255,255]                           #蛇的颜色
        self.cube_size = 10                                  #色块的大小
        self.init_snake_head_height = int(random.randrange(0,self.display_height,self.cube_size))
        self.init_snake_head_width = int(random.randrange(0,self.display_width,self.cube_size))
        self.head = Snk.snake(self.screen,self.HEADcolor,[self.init_snake_head_height,self.init_snake_head_width], self.thisWay, self.cube_size)
        self.c = cake.cake(self.screen,self.cube_size)
        self.point = 0
        self.turn_pos = []
        self.movingRate = 15                                 #刷新率
        self.snake_list = [self.head]
        for i in range(0,7):
            s = Snk.snake(self.screen,self.color,[self.init_snake_head_height-(i+1)*self.cube_size, self.init_snake_head_width], self.thisWay,self.cube_size)#一开始有多少截
            self.snake_list.append(s)
        self.turn_index = 0
        self.stop = False
        self.input_value = np.array([0])
        self.score = 10
        self.previous_position = self.head.getPosition()
        self.ate_the_cake = False

#游戏开始
    def snake_moves(self):
        for snake in self.snake_list:
                if  snake.getTurns() == []:
                    snake.go(snake.getDirection())
                else:
                    if  snake.getPosition() == snake.getTurns()[self.turn_index][0]:
                        snake.go(snake.getTurns()[self.turn_index][1])
                        snake.drop_first_turn() 
                    else:
                        snake.go(snake.getDirection())

    def sanke_grows(self):
        position = []
        last_snake_position = self.snake_list[-1].getPosition()
        last_sanke_dir = self.snake_list[-1].getDirection()

        last_snake_pos = [last_snake_position[0],last_snake_position[1]]
        #新建一段蛇
        if last_sanke_dir == 'up':
            position = [last_snake_pos[0],last_snake_pos[1]+self.cube_size]
        if last_sanke_dir == 'down':
            position = [last_snake_pos[0],last_snake_pos[1]-self.cube_size]
        if last_sanke_dir == 'left':
            position = [last_snake_pos[0]+self.cube_size,last_snake_pos[1]]
        if last_sanke_dir == 'right':
            position = [last_snake_pos[0]-self.cube_size,last_snake_pos[1]]
        #给新的蛇加上turn属性
        newSnake = Snk.snake(self.screen, self.color, position, last_sanke_dir,self.cube_size)
        if self.snake_list[-1].getTurns() != []:
            for turn in self.snake_list[-1].getTurns():
                newSnake.setTurns(turn)
            #   print(self.snake_list[-1].getTurns())
        self.snake_list.append(newSnake)


    def display_new_cake(self):
        self.c.displayNEWCake()
        #判断新的蛋糕是不是在蛇体内生成
        count = 0
        gate = True
        while gate:
            gate = False
            for s in self.snake_list:
                if s.getPosition() == [self.c.left,self.c.top]:
                    self.c.displayNEWCake()
                    count += 1
                    gate = True
                elif (count == 0):
                    gate = False

    def listening_to_keyboard(self):
        event = pygame.event.poll()
        if event.type == pygame.QUIT:
            pygame.quit()
            exit()
        elif event.type == pygame.KEYDOWN:
            k = self.head.getPosition()
            if event.key == pygame.K_UP and self.head.getDirection() != 'down':
                self.thisWay = 'up'        
                direction = 'up'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif event.key == pygame.K_DOWN and self.head.getDirection() != 'up':
                self.thisWay = 'down'
                direction = 'down'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif event.key == pygame.K_LEFT and self.head.getDirection() != 'right':
                self.thisWay = 'left'
                direction = 'left'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif event.key == pygame.K_RIGHT and self.head.getDirection() != 'left':
                self.thisWay = 'right'
                direction = 'right'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])

    def snake_hits_itself(self):
        for s in self.snake_list:
            if self.head == s:
                pass
            elif self.head.getPosition() == s.getPosition():
                s.setColor([187,34,34])
                return True
        return False
    #判断蛇是不是撞墙了
    def snake_hits_the_wall(self):
        if ((self.head.getPosition()[0] < 0) \
            or (self.head.getPosition()[0] > self.display_height) \
            or (self.head.getPosition()[1] < 0) \
            or (self.head.getPosition()[1] > self.display_width)):
            for s in self.snake_list:
                s.setColor([187,34,34])
            return True
        return False

    def is_food_to_my_left(self):
        if self.head.getDirection() == "left":
            if self.head.getPosition()[1] < self.c.getPosition()[1]:
                return True
        elif self.head.getDirection() == "right":
            if self.head.getPosition()[1] > self.c.getPosition()[1]:
                return True
        elif self.head.getDirection() == "up":
            if self.head.getPosition()[0] > self.c.getPosition()[0]:
                return True
        elif self.head.getDirection() == "down":
            if self.head.getPosition()[0] < self.c.getPosition()[0]:
                return True
        return False

    def is_wall_to_my_left(self):
        if self.head.getDirection() == "left":
            if self.head.getPosition()[1] == self.display_height:
                return True  
        elif self.head.getDirection() == "right":
            if self.head.getPosition()[1] == 0:
                return True
        elif self.head.getDirection() == "up":
            if self.head.getPosition()[0] > 0:
                return True
        elif self.head.getDirection() == "down":
            if self.head.getPosition()[0] == self.display_width:
                return True
        return False
    
    def is_myself_to_my_left(self):
        if self.head.getDirection() == "left":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]+10] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "right":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]-10] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "up":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]-10,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "down":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]+10,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True 
        return False      

    def is_food_to_my_right(self):
        if self.head.getDirection() == "left":
            if self.head.getPosition()[1] > self.c.getPosition()[1]:
                return True
        elif self.head.getDirection() == "right":
            if self.head.getPosition()[1] < self.c.getPosition()[1]:
                return True
        elif self.head.getDirection() == "up":
            if self.head.getPosition()[0] < self.c.getPosition()[0]:
                return True
        elif self.head.getDirection() == "down":
            if self.head.getPosition()[0] > self.c.getPosition()[0]:
                return True
        return False
    
    def is_wall_to_my_right(self):
        if self.head.getDirection() == "left":
            if self.head.getPosition()[1] == 0:
                return True  
        elif self.head.getDirection() == "right":
            if self.head.getPosition()[1] == self.display_height:
                return True
        elif self.head.getDirection() == "up":
            if self.head.getPosition()[0] > self.display_width:
                return True
        elif self.head.getDirection() == "down":
            if self.head.getPosition()[0] == 0:
                return True
        return False

    def is_myself_to_my_right(self):
        if self.head.getDirection() == "left":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]-10] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "right":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]+10] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "up":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]+10,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "down":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]-10,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True 
        return False 

    def is_food_in_front_of_me(self):
        if self.head.getDirection() == "left" or self.head.getDirection() == "right":
            if self.head.getPosition()[1] == self.c.getPosition()[1]:
                return True
        elif self.head.getDirection() == "up" or self.head.getDirection() == "down":
            if self.head.getPosition()[0] == self.c.getPosition()[0]:
                return True
        return False

    def is_wall_in_front_of_me(self):
        if (self.head.getPosition()[0] == 0) and (self.head.getDirection() == "left"):
            return True
        elif (self.head.getPosition()[0] == self.display_height) and (self.head.getDirection() == "right"):    
            return True
        elif (self.head.getPosition()[1] == 0) and (self.head.getDirection() == "up"):
            return True
        elif (self.head.getPosition()[1] == self.display_width) and (self.head.getDirection() == "down"):
            return True
        return False

    def is_myself_in_front_of_me(self):
        if self.head.getDirection() == "left":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]-10,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "right":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]+10,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "up":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]-10] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "down":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]+10] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True 
        return False

    def get_current_status(self):
        input_list = []
        #LEFT
        if self.is_wall_to_my_left():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_myself_to_my_left():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_food_to_my_left():
            input_list.append(1)
        else:
            input_list.append(0)
        #RIGHT
        if self.is_wall_to_my_right():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_myself_to_my_right():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_food_to_my_right():
            input_list.append(1)
        else:
            input_list.append(0)
        #STRAIGHT
        if self.is_wall_in_front_of_me():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_myself_in_front_of_me():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_food_in_front_of_me():
            input_list.append(1)
        else:
            input_list.append(0)
        
        return np.asarray(input_list)

    def ai_decided_direction(self,output):
        if output[0][0] == max(output[0][0],output[1][0],output[2][0]):
            k = self.head.getPosition()
            if self.head.getDirection() == "left":
                self.thisWay = 'down'        
                direction = 'down'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "right":
                self.thisWay = 'up'        
                direction = 'up'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "up":
                self.thisWay = 'left'        
                direction = 'left'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "down":
                self.thisWay = 'right'        
                direction = 'right'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
        elif output[1][0] == max(output[0][0],output[1][0],output[2][0]):
            k = self.head.getPosition()
            if self.head.getDirection() == "left":
                self.thisWay = 'up'        
                direction = 'up'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "right":
                self.thisWay = 'down'        
                direction = 'down'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "up":
                self.thisWay = 'right'        
                direction = 'right'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "down":
                self.thisWay = 'left'        
                direction = 'left'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
        elif output[2][0] == max(output[0][0],output[1][0],output[2][0]):
                pass
    
    def fitness(self):
        return self.score
    
    def distence(self,position1, position2):
        return ((position1[0]-position2[0])**2+(position1[1]-position2[1])**2)**0.5
    
    def reward(self):
        if self.distence(self.head.getPosition(),self.c.getPosition()) < self.distence(self.previous_position,self.c.getPosition()):
            self.score += 2
        if self.distence(self.head.getPosition(),self.c.getPosition()) > self.distence(self.previous_position,self.c.getPosition()):
            self.score -= 3
        if self.ate_the_cake:
            self.score += 11
        if self.snake_hits_itself():
            self.score -= 6
        if self.snake_hits_the_wall():
            self.score -= 9       
        
    def start(self):
        while True:
            self.screen.fill(self.background_color)
            self.c.displayCake()  
            for snakes in self.snake_list:
                snakes.drawSnake() 
            font = pygame.font.Font(None, 50)
            pygame.display.update()
            #self.score = font.render(str(self.point),1,(255,255,255))
            #textpos = [300,10]   
            #self.screen.blit(score,textpos)
    #Ai
            self.input_value = self.get_current_status()
            new_input_value = self.input_value.reshape((len(self.get_current_status()),1))
            output = self.neural_network.feedforward(new_input_value).tolist()
            self.ai_decided_direction(output)
    #监听键盘事件
            #self.listening_to_keyboard()
            self.previous_position = self.head.getPosition()
    #蛇的操作系统
            if  not(self.stop):
                self.snake_moves()
                self.evolution_moves -= 1
                self.reward()
    #吃蛋糕
            self.ate_the_cake = False
            if  self.head.getPosition() == [self.c.left,self.c.top]:
                self.ate_the_cake = True
                self.point += 1
                self.sanke_grows()
                self.display_new_cake()
            pygame.display.update()   
   
    #判断蛇头有没有撞到
            if self.snake_hits_the_wall():
                self.stop = True
                break
                #pass
            if self.snake_hits_itself():
                self.stop = True
                break
                #pass
            if self.evolution_moves == 0:
                break
                #pass
                #return self.neural_network.weights, self.neural_network.biases, self.score
            self.clock.tick(self.movingRate)
        
            
            

            
            
